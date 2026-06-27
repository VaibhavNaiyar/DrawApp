"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { RoughCanvas } from "roughjs/bin/canvas";
import type {
  Tool,
  CanvasSettings,
  DrawingShape,
  DragState,
  PencilShape,
  RectShape,
  EllipseShape,
  LineShape,
  ArrowShape,
} from "./types";
import { createRoughCanvas, renderCanvas } from "./renderer";
import { hitTest } from "./hitTest";
import { useDrawHistory } from "./useDrawHistory";
import Toolbar from "./Toolbar";
import styles from "./DrawCanvas.module.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

/**
 * Apply a total (dx, dy) displacement to a shape, using its original snapshot.
 * Always computed from the snapshot so floating-point errors don't accumulate.
 */
function translateShape(shape: DrawingShape, dx: number, dy: number): DrawingShape {
  switch (shape.type) {
    case "pencil":
      return {
        ...shape,
        points: shape.points.map(([x, y]) => [x + dx, y + dy]),
      };
    case "rect":
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case "ellipse":
      return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy };
    case "line":
    case "arrow":
      return {
        ...shape,
        x1: shape.x1 + dx,
        y1: shape.y1 + dy,
        x2: shape.x2 + dx,
        y2: shape.y2 + dy,
      };
  }
}

/** Deep-copy a shape so drag snapshots don't share references with history. */
function cloneShape(shape: DrawingShape): DrawingShape {
  return JSON.parse(JSON.stringify(shape)) as DrawingShape;
}

/** Returns true if the in-progress shape has enough content to commit. */
function isSignificantShape(shape: DrawingShape): boolean {
  switch (shape.type) {
    case "pencil":
      return shape.points.length > 1;
    case "rect":
      return shape.w > 2 && shape.h > 2;
    case "ellipse":
      return shape.rx > 2 && shape.ry > 2;
    case "line":
    case "arrow":
      return (
        Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) > 4
      );
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DrawCanvasProps {
  roomId: string;
}

export default function DrawCanvas({ roomId }: DrawCanvasProps) {
  const router = useRouter();

  // ── Canvas refs ────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const roughCanvasRef = useRef<RoughCanvas | null>(null);

  // ── Drawing state (refs — no React re-render on update) ────────────────────
  const isDrawingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const currentShapeRef = useRef<DrawingShape | null>(null); // shape being drawn (not committed)
  const dragStateRef = useRef<DragState | null>(null); // active select-tool drag

  // ── React state ────────────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<Tool>("pencil");
  const [settings, setSettings] = useState<CanvasSettings>({
    strokeColor: "#e2e8f0",
    fillColor: "transparent",
    strokeWidth: 2,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /**
   * Transient overlay for drag-move: while the user is dragging a shape,
   * this replaces the committed shapes for rendering — without polluting
   * the undo stack. On mouseUp, the final position is committed once.
   */
  const [transientShapes, setTransientShapes] = useState<DrawingShape[] | null>(null);

  const history = useDrawHistory();
  const { shapes, commit, undo, redo, clear, canUndo, canRedo } = history;

  // ── Canvas size ────────────────────────────────────────────────────────────
  // We set canvas pixel dimensions explicitly so the drawing buffer matches
  // the display size. CSS makes the element 100% of its container.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      // Re-render after resize
      const rc = roughCanvasRef.current;
      if (!rc) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      renderCanvas(ctx, transientShapes ?? shapes, rc, selectedId);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — runs once on mount

  // ── Create RoughCanvas once ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    roughCanvasRef.current = createRoughCanvas(canvas);
  }, []);

  // ── Render loop (triggered by committed state changes) ─────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const rc = roughCanvasRef.current;
    if (!canvas || !rc) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderCanvas(ctx, transientShapes ?? shapes, rc, selectedId);
  }, [shapes, transientShapes, selectedId]);

  // ── Imperative draw (called in mousemove — bypasses React for 60fps) ───────
  const drawImmediate = useCallback(
    (displayShapes: DrawingShape[]) => {
      const canvas = canvasRef.current;
      const rc = roughCanvasRef.current;
      if (!canvas || !rc) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      renderCanvas(ctx, displayShapes, rc, null);
    },
    []
  );

  // ── Coordinate helper ──────────────────────────────────────────────────────
  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const newBase = () => ({
    id: makeId(),
    strokeColor: settings.strokeColor,
    strokeWidth: settings.strokeWidth,
  });

  // ── Mouse events ───────────────────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // left-click only
    const { x, y } = getPos(e);
    startPosRef.current = { x, y };

    if (activeTool === "select") {
      const displayShapes = transientShapes ?? shapes;
      const hit = hitTest(displayShapes, x, y);
      setSelectedId(hit?.id ?? null);
      if (hit) {
        dragStateRef.current = {
          shapeId: hit.id,
          startMouseX: x,
          startMouseY: y,
          snapshot: cloneShape(hit),
        };
        isDrawingRef.current = true;
      }
      return;
    }

    if (activeTool === "eraser") {
      const displayShapes = transientShapes ?? shapes;
      const hit = hitTest(displayShapes, x, y);
      if (hit) {
        const next = shapes.filter((s) => s.id !== hit.id);
        commit(next);
        if (selectedId === hit.id) setSelectedId(null);
      }
      isDrawingRef.current = true; // keep erasing on drag
      return;
    }

    // Drawing tools
    isDrawingRef.current = true;
    setSelectedId(null);

    const base = newBase();

    let shape: DrawingShape;
    if (activeTool === "pencil") {
      const s: PencilShape = { ...base, type: "pencil", points: [[x, y]] };
      shape = s;
    } else if (activeTool === "rect") {
      const s: RectShape = {
        ...base,
        type: "rect",
        x,
        y,
        w: 0,
        h: 0,
        fillColor: settings.fillColor,
      };
      shape = s;
    } else if (activeTool === "ellipse") {
      const s: EllipseShape = {
        ...base,
        type: "ellipse",
        cx: x,
        cy: y,
        rx: 0,
        ry: 0,
        fillColor: settings.fillColor,
      };
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
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getPos(e);

    // ── Drag-move ────────────────────────────────────────────────────────────
    if (activeTool === "select" && dragStateRef.current) {
      const drag = dragStateRef.current;
      const dx = x - drag.startMouseX;
      const dy = y - drag.startMouseY;
      const movedShape = translateShape(drag.snapshot, dx, dy);
      const next = shapes.map((s) =>
        s.id === drag.shapeId ? movedShape : s
      );
      setTransientShapes(next); // triggers render effect
      return;
    }

    if (!isDrawingRef.current) return;

    // ── Eraser drag ───────────────────────────────────────────────────────────
    if (activeTool === "eraser") {
      const displayShapes = transientShapes ?? shapes;
      const hit = hitTest(displayShapes, x, y);
      if (hit) {
        const next = shapes.filter((s) => s.id !== hit.id);
        commit(next);
        if (selectedId === hit.id) setSelectedId(null);
      }
      return;
    }

    // ── Shape preview ─────────────────────────────────────────────────────────
    const cur = currentShapeRef.current;
    if (!cur) return;

    const sx = startPosRef.current.x;
    const sy = startPosRef.current.y;

    let updated: DrawingShape;

    if (cur.type === "pencil") {
      const next: PencilShape = {
        ...cur,
        points: [...cur.points, [x, y]],
      };
      updated = next;
    } else if (cur.type === "rect") {
      const next: RectShape = {
        ...cur,
        x: Math.min(sx, x),
        y: Math.min(sy, y),
        w: Math.abs(x - sx),
        h: Math.abs(y - sy),
      };
      updated = next;
    } else if (cur.type === "ellipse") {
      const next: EllipseShape = {
        ...cur,
        cx: (sx + x) / 2,
        cy: (sy + y) / 2,
        rx: Math.abs(x - sx) / 2,
        ry: Math.abs(y - sy) / 2,
      };
      updated = next;
    } else if (cur.type === "line") {
      const next: LineShape = { ...cur, x2: x, y2: y };
      updated = next;
    } else {
      const next: ArrowShape = { ...cur, x2: x, y2: y };
      updated = next;
    }

    currentShapeRef.current = updated;
    // Bypass React — draw directly for 60fps
    drawImmediate([...shapes, updated]);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // ── Commit drag-move ──────────────────────────────────────────────────────
    if (activeTool === "select" && dragStateRef.current) {
      const drag = dragStateRef.current;
      const { x, y } = getPos(e);
      const dx = x - drag.startMouseX;
      const dy = y - drag.startMouseY;

      // Only commit if the shape actually moved
      if (Math.hypot(dx, dy) > 1) {
        const movedShape = translateShape(drag.snapshot, dx, dy);
        const next = shapes.map((s) =>
          s.id === drag.shapeId ? movedShape : s
        );
        commit(next);
      }

      setTransientShapes(null);
      dragStateRef.current = null;
      isDrawingRef.current = false;
      return;
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    // ── Commit drawn shape ────────────────────────────────────────────────────
    const shape = currentShapeRef.current;
    currentShapeRef.current = null;

    if (
      shape &&
      activeTool !== "select" &&
      activeTool !== "eraser" &&
      isSignificantShape(shape)
    ) {
      commit([...shapes, shape]);
    } else {
      // Re-render without the preview shape
      drawImmediate(shapes);
    }
  };

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      // Undo / Redo
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if (e.key === "z" && e.shiftKey)  { e.preventDefault(); redo(); return; }
        if (e.key === "y")                { e.preventDefault(); redo(); return; }
      }

      // Delete selected shape
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        commit(shapes.filter((s) => s.id !== selectedId));
        setSelectedId(null);
        return;
      }

      // Tool shortcuts
      const toolMap: Record<string, Tool> = {
        s: "select", p: "pencil", r: "rect",
        e: "ellipse", l: "line", a: "arrow", x: "eraser",
      };
      const tool = toolMap[e.key.toLowerCase()];
      if (tool) setActiveTool(tool);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shapes, selectedId, undo, redo, commit]);

  // ── Cursor style ───────────────────────────────────────────────────────────
  const cursorMap: Record<Tool, string> = {
    select: "default",
    pencil: "crosshair",
    rect: "crosshair",
    ellipse: "crosshair",
    line: "crosshair",
    arrow: "crosshair",
    eraser: "cell",
  };

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
        onClear={() => {
          clear();
          setSelectedId(null);
          setTransientShapes(null);
        }}
      />

      {/* Room info badge */}
      <div className={styles.badge}>
        <button
          className={styles.backBtn}
          onClick={() => router.push("/dashboard")}
          type="button"
        >
          ← back
        </button>
        <span>|</span>
        <span>
          Room <strong>{roomId.slice(0, 8)}…</strong>
        </span>
      </div>

      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ cursor: cursorMap[activeTool] }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
}
