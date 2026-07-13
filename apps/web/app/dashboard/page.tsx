"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import styles from "./dashboard.module.css";
import ThemeToggle from "@/components/ui/ThemeToggle";
import ZoomControls from "@/components/ui/ZoomControls";

interface Room {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const userName = session?.user?.name ?? session?.user?.email ?? "there";

  const [joinOpen, setJoinOpen] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [joinError, setJoinError] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [myRooms, setMyRooms] = useState<Room[]>([]);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2;
  const ZOOM_STEP = 0.1;
  const joinInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/rooms")
      .then((r) => r.json())
      .then((data: { rooms: Room[] }) => setMyRooms(data.rooms ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (joinOpen) setTimeout(() => joinInputRef.current?.focus(), 50);
  }, [joinOpen]);

  useEffect(() => {
    if (renamingId) setTimeout(() => renameInputRef.current?.focus(), 50);
  }, [renamingId]);

  function startRename(room: Room, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingId(room.id);
    setRenameValue(room.name);
  }

  async function deleteRoom(id: string) {
    const res = await fetch(`/api/rooms/${id}`, { method: "DELETE" });
    if (res.ok) {
      setMyRooms((prev) => prev.filter((r) => r.id !== id));
    }
    setConfirmDeleteId(null);
  }

  async function submitRename(id: string) {
    const name = renameValue.trim();
    if (!name) { setRenamingId(null); return; }
    const res = await fetch(`/api/rooms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setMyRooms((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
    }
    setRenamingId(null);
  }

  async function handleCreate() {
    setCreateError("");
    setCreating(true);
    try {
      const tokenRes = await fetch("/api/auth/token");
      if (!tokenRes.ok) { router.push("/signin"); return; }
      const { token } = await tokenRes.json() as { token: string };

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_HTTP_URL ?? "http://localhost:3001"}/room`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({}),
        }
      );
      const data = await res.json() as { roomId?: string; message?: string };
      if (!res.ok) { setCreateError(data.message ?? "Failed to create room"); return; }
      router.push(`/room/${data.roomId}`);
    } catch {
      setCreateError("Could not connect to server");
    } finally {
      setCreating(false);
    }
  }

  function handleJoin(e?: React.FormEvent) {
    e?.preventDefault();
    const id = roomId.trim();
    if (!id) { setJoinError("Enter a room ID"); return; }
    router.push(`/room/${id}`);
  }

  async function handleSignout() {
    await signOut({ redirect: false });
    router.push("/signin");
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
  }

  // Ctrl+scroll to zoom on the splash
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, parseFloat((z + delta).toFixed(2)))));
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className={styles.splash}>
      {/* Theme toggle — top right */}
      <div className={styles.topRight}>
        <ThemeToggle variant="pill" />
      </div>

      {/* Zoom controls — bottom left */}
      <div className={styles.zoomBar}>
        <ZoomControls
          zoom={zoom}
          onZoomOut={() => setZoom((z) => Math.max(ZOOM_MIN, parseFloat((z - ZOOM_STEP).toFixed(2))))}
          onZoomIn={() => setZoom((z) => Math.min(ZOOM_MAX, parseFloat((z + ZOOM_STEP).toFixed(2))))}
          onReset={() => setZoom(1)}
        />
      </div>

      {/* Center panel */}
      <div className={styles.panel} style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}>

        {/* Logo */}
        <div className={styles.logoRow}>
          <svg className={styles.logoIcon} viewBox="0 0 40 40" fill="none" aria-hidden>
            <path d="M8 32 L6 34 L8 34 L8 32Z" fill="currentColor" />
            <rect x="7" y="8" width="6" height="24" rx="2" transform="rotate(-30 20 20)" fill="currentColor" opacity="0.9"/>
            <rect x="11" y="5" width="6" height="6" rx="1.5" transform="rotate(-30 20 20)" fill="currentColor" opacity="0.5"/>
            <path d="M6 34 L10 30 L14 34Z" fill="currentColor" opacity="0.4"/>
            <circle cx="28" cy="12" r="8" fill="currentColor" opacity="0.12"/>
            <path d="M23 12 Q28 7 33 12 Q28 17 23 12Z" fill="currentColor" opacity="0.5"/>
          </svg>
          <h1 className={styles.logoText}>DRAW APP</h1>
        </div>

        {/* Welcome */}
        <p className={styles.welcome}>
          Welcome, {userName}!<br />
          You can draw whatever you want in here.
        </p>

        <div className={styles.divider} />

        {/* Menu */}
        <ul className={styles.menu}>

          {/* Create Room */}
          <li>
            <button className={styles.menuItem} onClick={handleCreate} disabled={creating} type="button">
              <span className={styles.menuIcon}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M3 5a2 2 0 012-2h3.586a1 1 0 01.707.293L10.707 4.707A1 1 0 0011.414 5H15a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V5z"/>
                  <path d="M10 8v4M8 10h4" strokeLinecap="round"/>
                </svg>
              </span>
              <span className={styles.menuLabel}>
                {creating ? "Creating…" : "Create Room"}
              </span>
            </button>
            {createError && <p className={styles.menuError}>{createError}</p>}
          </li>

          {/* Join Room */}
          <li>
            <button
              className={`${styles.menuItem} ${joinOpen ? styles.menuItemActive : ""}`}
              onClick={() => { setJoinOpen((o) => !o); setJoinError(""); }}
              type="button"
            >
              <span className={styles.menuIcon}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <circle cx="8" cy="7" r="3"/>
                  <path d="M2 17c0-3.314 2.686-5 6-5"/>
                  <path d="M14 11v6M11 14h6" strokeLinecap="round"/>
                </svg>
              </span>
              <span className={styles.menuLabel}>Join Room…</span>
            </button>
            {joinOpen && (
              <form className={styles.joinForm} onSubmit={handleJoin}>
                <input
                  ref={joinInputRef}
                  className={styles.joinInput}
                  type="text"
                  placeholder="Paste room ID here"
                  value={roomId}
                  onChange={(e) => { setJoinError(""); setRoomId(e.target.value); }}
                />
                <button className={styles.joinBtn} type="submit">Join →</button>
                {joinError && <p className={styles.menuError}>{joinError}</p>}
              </form>
            )}
          </li>

          {/* My Rooms */}
          <li>
              <button
                className={`${styles.menuItem} ${roomsOpen ? styles.menuItemActive : ""}`}
                onClick={() => setRoomsOpen((o) => !o)}
                type="button"
              >
                <span className={styles.menuIcon}>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <rect x="2" y="4" width="16" height="13" rx="2"/>
                    <path d="M2 8h16" strokeLinecap="round"/>
                    <path d="M6 4V3M14 4V3" strokeLinecap="round"/>
                  </svg>
                </span>
                <span className={styles.menuLabel}>My Rooms</span>
                {myRooms.length > 0 && <span className={styles.menuShortcut}>{myRooms.length}</span>}
              </button>
              {roomsOpen && (
                <ul className={styles.roomList}>
                  {myRooms.map((room) => (
                    <li key={room.id}>
                      {renamingId === room.id ? (
                        <form
                          className={styles.renameForm}
                          onSubmit={(e) => { e.preventDefault(); void submitRename(room.id); }}
                        >
                          <input
                            ref={renameInputRef}
                            className={styles.renameInput}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => void submitRename(room.id)}
                            onKeyDown={(e) => { if (e.key === "Escape") setRenamingId(null); }}
                          />
                          <button className={styles.renameBtn} type="submit">Save</button>
                        </form>
                      ) : (
                        <div className={styles.roomItem}>
                          <button
                            className={styles.roomOpen}
                            onClick={() => router.push(`/room/${room.id}`)}
                            type="button"
                          >
                            <span className={styles.roomName}>{room.name || `Drawing`}</span>
                            <span className={styles.roomDate}>{formatDate(room.createdAt)}</span>
                          </button>
                          <button
                            className={styles.renameIcon}
                            onClick={(e) => startRename(room, e)}
                            type="button"
                            title="Rename"
                          >
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          {confirmDeleteId === room.id ? (
                            <span className={styles.confirmDelete}>
                              <span className={styles.confirmText}>Delete?</span>
                              <button className={styles.confirmYes} onClick={() => void deleteRoom(room.id)} type="button">Yes</button>
                              <button className={styles.confirmNo} onClick={() => setConfirmDeleteId(null)} type="button">No</button>
                            </span>
                          ) : (
                            <button
                              className={styles.deleteIcon}
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(room.id); }}
                              type="button"
                              title="Delete"
                            >
                              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5L11 4" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                  {myRooms.length === 0 && (
                    <li className={styles.emptyRooms}>No rooms yet — create one above</li>
                  )}
                </ul>
              )}
            </li>

          {/* Help */}
          <li>
            <button
              className={styles.menuItem}
              onClick={() => router.push("/help")}
              type="button"
            >
              <span className={styles.menuIcon}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <circle cx="10" cy="10" r="8"/>
                  <path d="M10 14v-1" strokeLinecap="round"/>
                  <path d="M10 11c0-1 .8-1.5 1.5-2.2C12.2 8 12.5 7.2 12 6.5 11.5 5.7 10.8 5.5 10 5.5c-1 0-1.8.6-2 1.5" strokeLinecap="round"/>
                </svg>
              </span>
              <span className={styles.menuLabel}>Help</span>
              <span className={styles.menuShortcut}>?</span>
            </button>
          </li>

          {/* About */}
          <li>
            <button
              className={styles.menuItem}
              onClick={() => router.push("/about")}
              type="button"
            >
              <span className={styles.menuIcon}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <circle cx="10" cy="10" r="8"/>
                  <path d="M10 9v5" strokeLinecap="round"/>
                  <circle cx="10" cy="6.5" r="0.75" fill="currentColor" stroke="none"/>
                </svg>
              </span>
              <span className={styles.menuLabel}>About</span>
            </button>
          </li>

          {/* Sign Out */}
          <li>
            <button className={styles.menuItem} onClick={handleSignout} type="button">
              <span className={styles.menuIcon}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M13 3h2a2 2 0 012 2v10a2 2 0 01-2 2h-2" strokeLinecap="round"/>
                  <path d="M9 13l4-3-4-3" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M13 10H3" strokeLinecap="round"/>
                </svg>
              </span>
              <span className={styles.menuLabel}>Sign Out</span>
            </button>
          </li>

        </ul>
      </div>
    </div>
  );
}
