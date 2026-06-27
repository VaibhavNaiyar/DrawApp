"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { WsDataType, WebSocketMessage, RoomParticipants } from "@repo/common";
import type { DrawingShape } from "./types";
import { encrypt, decrypt } from "./crypto";

// ─── Public types ──────────────────────────────────────────────────────────

export interface WsHandlers {
  onExistingShapes(shapes: DrawingShape[]): void;
  onRemoteDraw(shape: DrawingShape): void;
  /** ids: array of shape IDs that were erased */
  onRemoteEraser(ids: string[]): void;
  onRemoteUpdate(shape: DrawingShape): void;
  /** in-progress stream preview from another user */
  onRemoteStream(connectionId: string, shape: DrawingShape): void;
  onRemoteStreamUpdate(connectionId: string, shape: DrawingShape): void;
  onCursorMove(connectionId: string, userId: string, userName: string, x: number, y: number): void;
  onParticipants(participants: RoomParticipants[]): void;
  onUserJoined(participants: RoomParticipants[]): void;
  /** called when another connection leaves */
  onUserLeft(connectionId: string): void;
}

export interface UseWebSocketReturn {
  isConnected: boolean;
  connectionId: string | null;
  participants: RoomParticipants[];
  sendDraw(shape: DrawingShape): Promise<void>;
  sendStreamShape(shape: DrawingShape): Promise<void>;
  sendEraser(ids: string[]): void;
  sendUpdate(shape: DrawingShape): Promise<void>;
  sendCursorMove(x: number, y: number): void;
}

// ─── Hook ──────────────────────────────────────────────────────────────────

const WS_URL = process.env.NEXT_PUBLIC_DRAW_WS_URL ?? "ws://localhost:8081";
const STREAM_THROTTLE_MS = 50;
const CURSOR_THROTTLE_MS = 50;

export function useWebSocket(
  roomId: string,
  userId: string,
  userName: string,
  cryptoKeyRef: React.MutableRefObject<CryptoKey | null>,
  handlers: WsHandlers
): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const connIdRef = useRef<string>("");

  // Mirror mutable props in refs so send callbacks ([] deps) always see latest
  const roomIdRef = useRef(roomId);
  const userIdRef = useRef(userId);
  const userNameRef = useRef(userName);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { userNameRef.current = userName; }, [userName]);

  // Always-fresh handlers ref — updated every render, read inside message handler
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // Throttle timestamps
  const streamThrottleRef = useRef(0);
  const cursorThrottleRef = useRef(0);

  const [isConnected, setIsConnected] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<RoomParticipants[]>([]);

  // ── Low-level send helpers ────────────────────────────────────────────────

  const rawSend = useCallback((msg: WebSocketMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  function buildMsg(overrides: Partial<WebSocketMessage>): WebSocketMessage {
    return {
      id: null,
      type: WsDataType.JOIN,
      connectionId: connIdRef.current,
      roomId: roomIdRef.current,
      userId: userIdRef.current,
      userName: userNameRef.current,
      message: null,
      participants: null,
      timestamp: new Date().toISOString(),
      ...overrides,
    };
  }

  async function encryptMsg(shape: DrawingShape, type: WsDataType): Promise<WebSocketMessage | null> {
    const key = cryptoKeyRef.current;
    if (!key) return null;
    const encData = await encrypt(key, JSON.stringify(shape));
    return buildMsg({ id: shape.id, type, message: encData });
  }

  // ── Connection lifecycle ──────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      // Fetch a short-lived JWT from the Next.js server (server has access to the session)
      let token: string;
      try {
        const res = await fetch("/api/ws-token");
        if (!res.ok) { console.error("[useWebSocket] Failed to fetch WS token:", res.status); return; }
        const data = await res.json() as { token: string };
        token = data.token;
      } catch (err) {
        console.error("[useWebSocket] WS token fetch error:", err);
        return;
      }

      if (cancelled) return;

      const ws = new WebSocket(`${WS_URL}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setIsConnected(true);
      };

      ws.onclose = () => {
        if (!cancelled) {
          setIsConnected(false);
          setConnectionId(null);
          connIdRef.current = "";
        }
      };

      ws.onerror = (e) => {
        console.error("[useWebSocket] socket error:", e);
      };

      ws.onmessage = async (event: MessageEvent<string>) => {
        if (cancelled) return;
        let msg: WebSocketMessage;
        try { msg = JSON.parse(event.data) as WebSocketMessage; } catch { return; }

        const h = handlersRef.current;
        const key = cryptoKeyRef.current;

        switch (msg.type) {

          // ── Server acknowledges connection ──────────────────────────────────
          case WsDataType.CONNECTION_READY: {
            connIdRef.current = msg.connectionId;
            setConnectionId(msg.connectionId);
            // Send JOIN immediately
            ws.send(JSON.stringify(buildMsg({ type: WsDataType.JOIN })));
            break;
          }

          // ── Initial room state ──────────────────────────────────────────────
          case WsDataType.EXISTING_SHAPES: {
            if (!msg.message || !key) break;
            let wsMsgs: WebSocketMessage[];
            try { wsMsgs = JSON.parse(msg.message) as WebSocketMessage[]; } catch { break; }
            const shapes: DrawingShape[] = [];
            for (const m of wsMsgs) {
              if (!m.message) continue;
              try {
                const json = await decrypt(key, m.message);
                shapes.push(JSON.parse(json) as DrawingShape);
              } catch { /* skip shapes we can't decrypt */ }
            }
            h.onExistingShapes(shapes);
            break;
          }

          case WsDataType.EXISTING_PARTICIPANTS: {
            const parts = msg.participants ?? [];
            setParticipants(parts);
            h.onParticipants(parts);
            break;
          }

          // ── Participant changes ─────────────────────────────────────────────
          case WsDataType.USER_JOINED: {
            const parts = msg.participants ?? [];
            setParticipants(parts);
            h.onUserJoined(parts);
            break;
          }

          case WsDataType.USER_LEFT: {
            // remove the cursor for the departed connection
            h.onUserLeft(msg.connectionId);
            // participants list comes from USER_JOINED / EXISTING_PARTICIPANTS
            break;
          }

          // ── Shape events (ignore our own echo) ──────────────────────────────
          case WsDataType.DRAW: {
            if (msg.connectionId === connIdRef.current) break; // our own echo
            if (!msg.message || !key) break;
            try {
              const json = await decrypt(key, msg.message);
              h.onRemoteDraw(JSON.parse(json) as DrawingShape);
            } catch { /* tampered / wrong key */ }
            break;
          }

          case WsDataType.ERASER: {
            if (msg.connectionId === connIdRef.current) break;
            let ids: string[] = [];
            try { ids = JSON.parse(msg.message ?? "[]") as string[]; } catch { break; }
            h.onRemoteEraser(ids);
            break;
          }

          case WsDataType.UPDATE: {
            if (msg.connectionId === connIdRef.current) break;
            if (!msg.message || !key) break;
            try {
              const json = await decrypt(key, msg.message);
              h.onRemoteUpdate(JSON.parse(json) as DrawingShape);
            } catch { /* skip */ }
            break;
          }

          // ── Stream previews (in-progress shapes from others) ────────────────
          case WsDataType.STREAM_SHAPE: {
            if (msg.connectionId === connIdRef.current) break;
            if (!msg.message || !key) break;
            try {
              const json = await decrypt(key, msg.message);
              h.onRemoteStream(msg.connectionId, JSON.parse(json) as DrawingShape);
            } catch { /* skip */ }
            break;
          }

          case WsDataType.STREAM_UPDATE: {
            if (msg.connectionId === connIdRef.current) break;
            if (!msg.message || !key) break;
            try {
              const json = await decrypt(key, msg.message);
              h.onRemoteStreamUpdate(msg.connectionId, JSON.parse(json) as DrawingShape);
            } catch { /* skip */ }
            break;
          }

          // ── Cursor presence ─────────────────────────────────────────────────
          case WsDataType.CURSOR_MOVE: {
            if (msg.connectionId === connIdRef.current) break;
            if (!msg.message) break;
            try {
              const { x, y } = JSON.parse(msg.message) as { x: number; y: number };
              h.onCursorMove(msg.connectionId, msg.userId, msg.userName ?? "?", x, y);
            } catch { /* skip */ }
            break;
          }

          default:
            break;
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  // Reconnect only if room or user identity changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId]);

  // ── Send functions ────────────────────────────────────────────────────────

  const sendDraw = useCallback(async (shape: DrawingShape) => {
    const msg = await encryptMsg(shape, WsDataType.DRAW);
    if (msg) rawSend(msg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSend]);

  const sendStreamShape = useCallback(async (shape: DrawingShape) => {
    const now = Date.now();
    if (now - streamThrottleRef.current < STREAM_THROTTLE_MS) return;
    streamThrottleRef.current = now;
    const msg = await encryptMsg(shape, WsDataType.STREAM_SHAPE);
    if (msg) rawSend(msg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSend]);

  const sendEraser = useCallback((ids: string[]) => {
    rawSend(buildMsg({ type: WsDataType.ERASER, message: JSON.stringify(ids) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSend]);

  const sendUpdate = useCallback(async (shape: DrawingShape) => {
    const msg = await encryptMsg(shape, WsDataType.UPDATE);
    if (msg) rawSend(msg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSend]);

  const sendCursorMove = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (now - cursorThrottleRef.current < CURSOR_THROTTLE_MS) return;
    cursorThrottleRef.current = now;
    rawSend(buildMsg({ type: WsDataType.CURSOR_MOVE, message: JSON.stringify({ x, y }) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSend]);

  return {
    isConnected,
    connectionId,
    participants,
    sendDraw,
    sendStreamShape,
    sendEraser,
    sendUpdate,
    sendCursorMove,
  };
}
