// AES-GCM-256 E2EE utilities using Web Crypto API.
// The encryption key lives in the URL fragment (#<base64url>) — never sent to
// the server, so the server only ever stores opaque encrypted blobs.

const ALGO = "AES-GCM";
const KEY_BITS = 256;

// ─── Key generation / import / export ──────────────────────────────────────

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGO, length: KEY_BITS },
    true,          // extractable so we can export to base64url
    ["encrypt", "decrypt"]
  );
}

export async function exportKeyToBase64url(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bufToBase64url(raw);
}

export async function importKeyFromBase64url(b64url: string): Promise<CryptoKey> {
  const raw = base64urlToBuf(b64url);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: ALGO, length: KEY_BITS },
    true,
    ["encrypt", "decrypt"]
  );
}

// ─── Encrypt / Decrypt ─────────────────────────────────────────────────────

/**
 * Encrypts a plaintext string.
 * Output format: base64url(IV[12 bytes] || AES-GCM ciphertext)
 */
export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV — GCM standard
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  // Prepend IV so the recipient can decrypt
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return bufToBase64url(combined.buffer);
}

/**
 * Decrypts a base64url payload produced by `encrypt`.
 * Throws if the key is wrong or data is tampered (AES-GCM provides authenticity).
 */
export async function decrypt(key: CryptoKey, b64url: string): Promise<string> {
  const combined = new Uint8Array(base64urlToBuf(b64url));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: ALGO, iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ─── localStorage key persistence ─────────────────────────────────────────
// Storing keys in localStorage (keyed by roomId) lets a user return to their
// own room and decrypt existing shapes without re-sharing the link.
// When a shared link (with #fragment) is opened, that key takes priority and
// is written to localStorage, so the new key is persisted for future visits.

const LS_PREFIX = "drawapp_key_";

export async function getStoredKey(roomId: string): Promise<CryptoKey | null> {
  if (typeof window === "undefined") return null;
  const b64 = localStorage.getItem(LS_PREFIX + roomId);
  if (!b64) return null;
  try {
    return await importKeyFromBase64url(b64);
  } catch {
    return null;
  }
}

export async function storeKey(roomId: string, key: CryptoKey): Promise<void> {
  if (typeof window === "undefined") return;
  const b64 = await exportKeyToBase64url(key);
  localStorage.setItem(LS_PREFIX + roomId, b64);
}

// ─── URL fragment helpers ──────────────────────────────────────────────────

/** Returns the base64url key string from window.location.hash, or null. */
export function getKeyFromFragment(): string | null {
  if (typeof window === "undefined") return null;
  const frag = window.location.hash.slice(1); // strip leading #
  return frag.length > 0 ? frag : null;
}

/** Writes the base64url key into window.location.hash without adding history. */
export function setKeyInFragment(b64url: string): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", `#${b64url}`);
}

// ─── Base64url helpers ─────────────────────────────────────────────────────

function bufToBase64url(buf: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buf)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlToBuf(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
