"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { RoughCanvas } from "roughjs/bin/canvas";
import type {
  Tool,
  CanvasSettings,
  DrawingShape,
  DragState,
  ResizeState,
  ResizeHandle,
  PencilShape,
  RectShape,
  EllipseShape,
  LineShape,
  ArrowShape,
  TextShape,
  RemoteCursor,
} from "./types";
import { createRoughCanvas, renderCanvas } from "./renderer";
import { hitTest, hitTestHandle } from "./hitTest";
import { translateShape, resizeShape } from "./shapeTransforms";
import { useDrawHistory } from "./useDrawHistory";
import { useWebSocket, type WsHandlers } from "./useWebSocket";
import {
  generateKey,
  exportKeyToBase64url,
  importKeyFromBase64url,
  getKeyFromFragment,
  setKeyInFragment,
  getStoredKey,
  storeKey,
} from "./crypto";
import CursorOverlay from "./CursorOverlay";
import Toolbar from "./Toolbar";
import styles from "./DrawCanvas.module.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

const handleCursorMap: Record<ResizeHandle, string> = {
  nw: "nw-resize", n:  "n-resize",  ne: "ne-resize",
  e:  "e-resize",  se: "se-resize", s:  "s-resize",
  sw: "sw-resize", w:  "w-resize",
  start: "crosshair", end: "crosshair",
};

function cloneShape(shape: DrawingShape): DrawingShape {
  return JSON.parse(JSON.stringify(shape)) as DrawingShape;
}

function isSignificantShape(shape: DrawingShape): boolean {
  switch (shape.type) {
    case "pencil":   return shape.points.length > 1;
    case "rect":     return shape.w > 2 && shape.h > 2;
    case "ellipse":  return shape.rx > 2 && shape.ry > 2;
    case "line":
    case "arrow":    return Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) > 4;
    case "text":     return shape.text.trim().length > 0;
  }
}

function userColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 70%, 55%)`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DrawCanvasProps {
  roomId: string;
  userId: string;
  userName: string;
}

export default function DrawCanvas({ roomId, userId, userName }: DrawCanvasProps) {
  const router = useRouter();

  // ── Canvas refs ────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const roughCanvasRef = useRef<RoughCanvas | null>(null);

  // ── Drawing refs ───────────────────────────────────────────────────────────
  const isDrawingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const currentShapeRef = useRef<DrawingShape | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);

  // ── Text tool ──────────────────────────────────────────────────────────────
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // ── E2EE ───────────────────────────────────────────────────────────────────
  const cryptoKeyRef = useRef<CryptoKey | null>(null);

  // ── React state ────────────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<Tool>("pencil");
  const [settings, setSettings] = useState<CanvasSettings>({
    strokeColor: "#e2e8f0",
    fillColor: "transparent",
    strokeWidth: 2,
    fontSize: 20,
  });
  const [textEditing, setTextEditing] = useState<{ id: string; x: number; y: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transientAll, setTransientAll] = useState<DrawingShape[] | null>(null);
  const [remoteShapes, setRemoteShapes] = useState<DrawingShape[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, DrawingShape>>(new Map());
  const [cursors, setCursors] = useState<Map<string, RemoteCursor>>(new Map());
  const [copied, setCopied] = useState(false);

  // ── History ────────────────────────────────────────────────────────────────
  const { shapes, commit, undo, redo, clear, canUndo, canRedo } = useDrawHistory();

  // ── Ref mirrors for drawImmediate (no React re-render cost) ───────────────
  const shapesRef = useRef<DrawingShape[]>([]);
  const remoteShapesRef = useRef<DrawingShape[]>([]);
  const remoteStreamsRef = useRef<Map<string, DrawingShape>>(new Map());
  useEffect(() => { shapesRef.current = shapes; }, [shapes]);
  useEffect(() => { remoteShapesRef.current = remoteShapes; }, [remoteShapes]);
  useEffect(() => { remoteStreamsRef.current = remoteStreams; }, [remoteStreams]);

  // ── WS handlers ───────────────────────────────────────────────────────────
  const wsHandlers: WsHandlers = {
    onExistingShapes(existingShapes) { setRemoteShapes(existingShapes); },
    onRemoteDraw(shape) {
      setRemoteShapes((prev) => [...prev, shape]);
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        for (const [id, s] of next) { if (s.id === shape.id) { next.delete(id); break; } }
        return next;
      });
    },
    onRemoteEraser(ids) { setRemoteShapes((prev) => prev.filter((s) => !ids.includes(s.id))); },
    onRemoteUpdate(shape) { setRemoteShapes((prev) => prev.map((s) => (s.id === shape.id ? shape : s))); },
    onRemoteStream(connectionId, shape) {
      setRemoteStreams((prev) => { const n = new Map(prev); n.set(connectionId, shape); return n; });
    },
    onRemoteStreamUpdate(connectionId, shape) {
      setRemoteStreams((prev) => { const n = new Map(prev); n.set(connectionId, shape); return n; });
    },
    onCursorMove(connectionId, uid, uname, x, y) {
      setCursors((prev) => {
        const n = new Map(prev);
        n.set(connectionId, { connectionId, userId: uid, userName: uname, color: userColor(uid), x, y });
        return n;
      });
    },
    onParticipants() {},
    onUserJoined() {},
    onUserLeft(connectionId) {
      setCursors((prev) => { const n = new Map(prev); n.delete(connectionId); return n; });
      setRemoteStreams((prev) => { const n = new Map(prev); n.delete(connectionId); return n; });
    },
  };

  const { isConnected, connectionId, participants, sendDraw, sendStreamShape, sendEraser, sendUpdate, sendCursorMove, sendLeave } =
    useWebSocket(roomId, userId, userName, cryptoKeyRef, wsHandlers);

  // ── E2EE initialisation ────────────────────────────────────────────────────
  // Priority: URL fragment → localStorage → generate new
  useEffect(() => {
    async function initCrypto() {
      let key: CryptoKey;
      const fragment = getKeyFromFragment();
      if (fragment) {
        key = await importKeyFromBase64url(fragment);
      } else {
        const stored = await getStoredKey(roomId);
        key = stored ?? (await generateKey());
      }
      // Always persist key in fragment + localStorage so sharing & return visits work
      const b64 = await exportKeyToBase64url(key);
      setKeyInFragment(b64);
      await storeKey(roomId, key);
      cryptoKeyRef.current = key;
    }
    initCrypto();
  }, [roomId]);

  // ── Canvas size ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const rc = roughCanvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!rc || !ctx) return;
      const base = transientAll ?? [...shapes, ...remoteShapes];
      renderCanvas(ctx, [...base, ...Array.from(remoteStreams.values())], rc, selectedId);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Create RoughCanvas once ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    roughCanvasRef.current = createRoughCanvas(canvas);
  }, []);

  // ── Render loop (state-driven) ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const rc = roughCanvasRef.current;
    if (!canvas || !rc) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const base = transientAll ?? [...shapes, ...remoteShapes];
    renderCanvas(ctx, [...base, ...Array.from(remoteStreams.values())], rc, selectedId);
  }, [shapes, transientAll, remoteShapes, remoteStreams, selectedId]);

  // ── Imperative draw (bypasses React for 60fps local preview) ──────────────
  const drawImmediate = useCallback((localWithPreview: DrawingShape[]) => {
    const canvas = canvasRef.current;
    const rc = roughCanvasRef.current;
    if (!canvas || !rc) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderCanvas(
      ctx,
      [...localWithPreview, ...remoteShapesRef.current, ...Array.from(remoteStreamsRef.current.values())],
      rc,
      null
    );
  }, []);

  // ── Position helpers ───────────────────────────────────────────────────────
  const getCanvasPos = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const newBase = () => ({
    id: makeId(),
    strokeColor: settings.strokeColor,
    strokeWidth: settings.strokeWidth,
  });

  // ── Text commit ────────────────────────────────────────────────────────────
  const commitText = useCallback((value: string, editing: { id: string; x: number; y: number } | null) => {
    if (!editing) return;
    const text = value.trim();
    if (text) {
      const shape: TextShape = {
        id: editing.id,
        type: "text",
        x: editing.x,
        y: editing.y,
        text,
        fontSize: settings.fontSize,
        strokeColor: settings.strokeColor,
        strokeWidth: settings.strokeWidth,
      };
      // Use shapesRef.current so we always have the latest shapes,
      // even if this runs before React re-renders with fresh state
      commit([...shapesRef.current, shape]);
      void sendDraw(shape);
    }
    setTextEditing(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, commit, sendDraw]);

  // ── Core pointer handlers (shared by mouse and touch) ──────────────────────

  const pointerDown = useCallback((x: number, y: number) => {
    startPosRef.current = { x, y };

    if (activeTool === "text") {
      setTextEditing({ id: makeId(), x, y });
      return;
    }

    if (activeTool === "select") {
      const allShapes = [...shapes, ...remoteShapes];

      // Check resize handles first (only when a shape is already selected)
      if (selectedId) {
        const selShape = allShapes.find((s) => s.id === selectedId);
        if (selShape) {
          const handle = hitTestHandle(selShape, x, y);
          if (handle) {
            resizeStateRef.current = { shapeId: selectedId, handle, snapshot: cloneShape(selShape) };
            isDrawingRef.current = true;
            return;
          }
        }
      }

      // Otherwise hit-test for move or deselect
      const hit = hitTest(allShapes, x, y);
      setSelectedId(hit?.id ?? null);
      if (hit) {
        dragStateRef.current = { shapeId: hit.id, startMouseX: x, startMouseY: y, snapshot: cloneShape(hit) };
        isDrawingRef.current = true;
      }
      return;
    }

    if (activeTool === "eraser") {
      const allShapes = [...shapes, ...remoteShapes];
      const hit = hitTest(allShapes, x, y);
      if (hit) {
        const isRemote = remoteShapes.some((s) => s.id === hit.id);
        if (isRemote) {
          setRemoteShapes((prev) => prev.filter((s) => s.id !== hit.id));
        } else {
          commit(shapes.filter((s) => s.id !== hit.id));
          if (selectedId === hit.id) setSelectedId(null);
        }
        void sendEraser([hit.id]);
      }
      isDrawingRef.current = true;
      return;
    }

    isDrawingRef.current = true;
    setSelectedId(null);

    const base = newBase();
    let shape: DrawingShape;

    if (activeTool === "pencil") {
      const s: PencilShape = { ...base, type: "pencil", points: [[x, y]] };
      shape = s;
    } else if (activeTool === "rect") {
      const s: RectShape = { ...base, type: "rect", x, y, w: 0, h: 0, fillColor: settings.fillColor };
      shape = s;
    } else if (activeTool === "ellipse") {
      const s: EllipseShape = { ...base, type: "ellipse", cx: x, cy: y, rx: 0, ry: 0, fillColor: settings.fillColor };
      shape = s;
    } else if (activeTool === "line") {
      const s: LineShape = { ...base, type: "line", x1: x, y1: y, x2: x, y2: y };
      shape = s;
    } else {
      const s: ArrowShape = { ...base, type: "arrow", x1: x, y1: y, x2: x, y2: y };
      shape = s;
    }

    currentShapeRef.current = shape;
    drawImmediate([...shapes, shape]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, settings, shapes, remoteShapes, selectedId, commit, sendEraser, drawImmediate]);

  const pointerMove = useCallback((x: number, y: number) => {
    sendCursorMove(x, y);

    if (activeTool === "select") {
      // ── Resize drag ──────────────────────────────────────────────────────────
      if (resizeStateRef.current) {
        const rs = resizeStateRef.current;
        const newShape = resizeShape(rs.snapshot, rs.handle, x, y);
        const allShapes = [...shapes, ...remoteShapes];
        setTransientAll(allShapes.map((s) => (s.id === rs.shapeId ? newShape : s)));
        if (canvasRef.current) canvasRef.current.style.cursor = handleCursorMap[rs.handle];
        return;
      }

      // ── Move drag ────────────────────────────────────────────────────────────
      if (dragStateRef.current) {
        const drag = dragStateRef.current;
        const dx = x - drag.startMouseX;
        const dy = y - drag.startMouseY;
        const movedShape = translateShape(drag.snapshot, dx, dy);
        const allShapes = [...shapes, ...remoteShapes];
        setTransientAll(allShapes.map((s) => (s.id === drag.shapeId ? movedShape : s)));
        if (canvasRef.current) canvasRef.current.style.cursor = "move";
        return;
      }

      // ── Hover: update cursor to show handles or move affordance ─────────────
      if (canvasRef.current) {
        if (selectedId) {
          const allShapes = [...shapes, ...remoteShapes];
          const selShape = allShapes.find((s) => s.id === selectedId);
          if (selShape) {
            const handle = hitTestHandle(selShape, x, y);
            if (handle) {
              canvasRef.current.style.cursor = handleCursorMap[handle];
            } else if (hitTest([selShape], x, y)) {
              canvasRef.current.style.cursor = "move";
            } else {
              canvasRef.current.style.cursor = "default";
            }
          } else {
            canvasRef.current.style.cursor = "default";
          }
        } else {
          canvasRef.current.style.cursor = "default";
        }
      }
      return;
    }

    if (!isDrawingRef.current) return;

    if (activeTool === "eraser") {
      const allShapes = [...shapes, ...remoteShapes];
      const hit = hitTest(allShapes, x, y);
      if (hit) {
        const isRemote = remoteShapes.some((s) => s.id === hit.id);
        if (isRemote) {
          setRemoteShapes((prev) => prev.filter((s) => s.id !== hit.id));
        } else {
          commit(shapes.filter((s) => s.id !== hit.id));
          if (selectedId === hit.id) setSelectedId(null);
        }
        void sendEraser([hit.id]);
      }
      return;
    }

    const cur = currentShapeRef.current;
    if (!cur) return;

    const sx = startPosRef.current.x;
    const sy = startPosRef.current.y;
    let updated: DrawingShape;

    if (cur.type === "pencil") {
      updated = { ...cur, points: [...cur.points, [x, y]] };
    } else if (cur.type === "rect") {
      updated = { ...cur, x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) };
    } else if (cur.type === "ellipse") {
      updated = { ...cur, cx: (sx + x) / 2, cy: (sy + y) / 2, rx: Math.abs(x - sx) / 2, ry: Math.abs(y - sy) / 2 };
    } else if (cur.type === "line") {
      updated = { ...cur, x2: x, y2: y };
    } else if (cur.type === "arrow") {
      updated = { ...cur, x2: x, y2: y };
    } else {
      return; // text / pencil handled above
    }

    currentShapeRef.current = updated;
    drawImmediate([...shapes, updated]);
    void sendStreamShape(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, shapes, remoteShapes, selectedId, commit, sendEraser, sendCursorMove, sendStreamShape, drawImmediate]);

  const pointerUp = useCallback((x: number, y: number) => {
    // ── Resize commit ──────────────────────────────────────────────────────────
    if (activeTool === "select" && resizeStateRef.current) {
      const rs = resizeStateRef.current;
      const newShape = resizeShape(rs.snapshot, rs.handle, x, y);
      const isRemote = remoteShapes.some((s) => s.id === rs.shapeId);
      if (isRemote) {
        setRemoteShapes((prev) => prev.filter((s) => s.id !== rs.shapeId));
        commit([...shapesRef.current, newShape]);
      } else {
        commit(shapesRef.current.map((s) => (s.id === rs.shapeId ? newShape : s)));
      }
      void sendUpdate(newShape);
      setTransientAll(null);
      resizeStateRef.current = null;
      isDrawingRef.current = false;
      if (canvasRef.current) canvasRef.current.style.cursor = "default";
      return;
    }

    // ── Move commit ────────────────────────────────────────────────────────────
    if (activeTool === "select" && dragStateRef.current) {
      const drag = dragStateRef.current;
      const dx = x - drag.startMouseX;
      const dy = y - drag.startMouseY;

      if (Math.hypot(dx, dy) > 1) {
        const movedShape = translateShape(drag.snapshot, dx, dy);
        const isRemote = remoteShapes.some((s) => s.id === drag.shapeId);
        if (isRemote) {
          setRemoteShapes((prev) => prev.filter((s) => s.id !== drag.shapeId));
          commit([...shapesRef.current, movedShape]);
        } else {
          commit(shapesRef.current.map((s) => (s.id === drag.shapeId ? movedShape : s)));
        }
        void sendUpdate(movedShape);
      }

      setTransientAll(null);
      dragStateRef.current = null;
      isDrawingRef.current = false;
      if (canvasRef.current) canvasRef.current.style.cursor = "default";
      return;
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const shape = currentShapeRef.current;
    currentShapeRef.current = null;

    if (shape && activeTool !== "select" && activeTool !== "eraser" && isSignificantShape(shape)) {
      // Use shapesRef.current so text committed via onBlur (which runs before mouseup)
      // is not lost when we write the next shape to history
      commit([...shapesRef.current, shape]);
      void sendDraw(shape);
    } else {
      drawImmediate(shapesRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, remoteShapes, commit, sendDraw, sendUpdate, drawImmediate]);

  // ── Mouse event wrappers ───────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const { x, y } = getCanvasPos(e.clientX, e.clientY);
    pointerDown(x, y);
  };
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasPos(e.clientX, e.clientY);
    pointerMove(x, y);
  };
  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasPos(e.clientX, e.clientY);
    pointerUp(x, y);
  };

  // ── Touch event wrappers ───────────────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // prevent scroll / zoom
    const t = e.touches[0];
    if (!t) return;
    const { x, y } = getCanvasPos(t.clientX, t.clientY);
    pointerDown(x, y);
  };
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const t = e.touches[0];
    if (!t) return;
    const { x, y } = getCanvasPos(t.clientX, t.clientY);
    pointerMove(x, y);
  };
  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (!t) return;
    const { x, y } = getCanvasPos(t.clientX, t.clientY);
    pointerUp(x, y);
  };

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if (e.key === "z" && e.shiftKey)  { e.preventDefault(); redo(); return; }
        if (e.key === "y")                { e.preventDefault(); redo(); return; }
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        const isRemote = remoteShapes.some((s) => s.id === selectedId);
        if (isRemote) {
          setRemoteShapes((prev) => prev.filter((s) => s.id !== selectedId));
        } else {
          commit(shapes.filter((s) => s.id !== selectedId));
        }
        void sendEraser([selectedId]);
        setSelectedId(null);
        return;
      }

      const toolMap: Record<string, Tool> = {
        s: "select", p: "pencil", r: "rect",
        e: "ellipse", l: "line", a: "arrow", x: "eraser", t: "text",
      };
      const tool = toolMap[e.key.toLowerCase()];
      if (tool) setActiveTool(tool);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shapes, remoteShapes, selectedId, undo, redo, commit, sendEraser]);

  // ── Focus textarea when text editing starts ────────────────────────────────
  useEffect(() => {
    if (textEditing) {
      // setTimeout 0 lets React finish painting the element before focusing
      const t = setTimeout(() => textareaRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [textEditing]);

  // ── Copy link ──────────────────────────────────────────────────────────────
  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, []);

  // ── Leave room ─────────────────────────────────────────────────────────────
  const handleLeave = useCallback(() => {
    sendLeave(roomId);
    router.push("/dashboard");
  }, [sendLeave, roomId, router]);

  // ── Cursor style ───────────────────────────────────────────────────────────
  const cursorMap: Record<Tool, string> = {
    select: "default", pencil: "crosshair", rect: "crosshair",
    ellipse: "crosshair", line: "crosshair", arrow: "crosshair", eraser: "cell",
    text: "text",
  };

  // ── Online count ───────────────────────────────────────────────────────────
  // participants from WS includes all users in the room (deduplicated by userId)
  const onlineCount = participants.length;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.wrapper}>
      <Toolbar
        activeTool={activeTool}
        settings={settings}
        canUndo={canUndo}
        canRedo={canRedo}
        onToolChange={setActiveTool}
        onSettingsChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
        onUndo={undo}
        onRedo={redo}
        onClear={() => { clear(); setSelectedId(null); setTransientAll(null); }}
      />

      {/* Room info badge */}
      <div className={styles.badge}>
        <button className={styles.backBtn} onClick={handleLeave} type="button">
          ← back
        </button>
        <span>|</span>
        <span>Room <strong>{roomId.slice(0, 8)}…</strong></span>

        {/* Participant count */}
        {onlineCount > 0 && (
          <span className={styles.online} title={participants.map((p) => p.userName).join(", ")}>
            {onlineCount} online
          </span>
        )}

        <span>|</span>

        {/* Copy link */}
        <button className={styles.copyBtn} onClick={handleCopyLink} type="button" title="Copy invite link (includes E2EE key)">
          {copied ? "Copied!" : "Copy Link"}
        </button>

        {/* Connection dot */}
        <span
          className={isConnected ? styles.dotOnline : styles.dotOffline}
          title={isConnected ? "connected" : "connecting…"}
        />
      </div>

      {/* Remote cursor overlay */}
      <CursorOverlay cursors={cursors} myConnectionId={connectionId} />

      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ cursor: cursorMap[activeTool], touchAction: "none" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {/* Text tool inline editor — rendered after canvas so it sits on top */}
      {textEditing && (
        <textarea
          ref={textareaRef}
          className={styles.textEditor}
          style={{
            left: textEditing.x,
            top: textEditing.y,
            fontSize: settings.fontSize,
            color: settings.strokeColor,
          }}
          rows={1}
          onInput={(e) => {
            const ta = e.currentTarget;
            ta.style.height = "auto";
            ta.style.height = `${ta.scrollHeight}px`;
          }}
          onKeyDown={(e) => {
            // Stop ALL keys from reaching the window keydown handler (toolbar shortcuts)
            e.stopPropagation();
            if (e.key === "Escape") {
              commitText(e.currentTarget.value, textEditing);
            }
          }}
          onBlur={(e) => commitText(e.currentTarget.value, textEditing)}
        />
      )}
    </div>
  );
}
