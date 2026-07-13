/**
 * Pure shape-mutation helpers.
 * No React, no canvas — just geometry.
 */
import type {
  DrawingShape,
  ResizeHandle,
  RectShape,
  EllipseShape,
  LineShape,
  ArrowShape,
  PencilShape,
  DiamondShape,
} from "./types";
import { getBBox } from "./hitTest";

const MIN_SIZE = 4; // minimum width/height after resize

// ─── Translate ────────────────────────────────────────────────────────────────

export function translateShape(shape: DrawingShape, dx: number, dy: number): DrawingShape {
  switch (shape.type) {
    case "pencil":
      return { ...shape, points: shape.points.map(([x, y]) => [x + dx, y + dy]) };
    case "rect":
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case "ellipse":
      return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy };
    case "diamond":
      return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy };
    case "line":
    case "arrow":
      return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy };
    case "text":
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
  }
}

// ─── Resize ───────────────────────────────────────────────────────────────────

/**
 * Returns a new shape with the given handle dragged to (mx, my).
 * Always derives from `snapshot` (drag start) so total-delta, not incremental.
 */
export function resizeShape(
  snapshot: DrawingShape,
  handle: ResizeHandle,
  mx: number,
  my: number
): DrawingShape {
  switch (snapshot.type) {
    case "rect":    return resizeRect(snapshot, handle, mx, my);
    case "ellipse": return resizeEllipse(snapshot, handle, mx, my);
    case "diamond": return resizeDiamond(snapshot, handle, mx, my);
    case "line":
    case "arrow":   return resizeLineArrow(snapshot, handle, mx, my);
    case "pencil":  return resizePencil(snapshot, handle, mx, my);
    case "text":    return snapshot; // text is not resizable, only movable
  }
}

// ─── Per-type resize helpers ──────────────────────────────────────────────────

function resizeRect(shape: RectShape, handle: ResizeHandle, mx: number, my: number): RectShape {
  const right  = shape.x + shape.w;
  const bottom = shape.y + shape.h;

  switch (handle) {
    case "nw": return { ...shape,
      x: Math.min(mx, right  - MIN_SIZE), y: Math.min(my, bottom - MIN_SIZE),
      w: Math.max(right  - mx, MIN_SIZE), h: Math.max(bottom - my, MIN_SIZE) };
    case "n":  return { ...shape,
      y: Math.min(my, bottom - MIN_SIZE), h: Math.max(bottom - my, MIN_SIZE) };
    case "ne": return { ...shape,
      y: Math.min(my, bottom - MIN_SIZE),
      w: Math.max(mx - shape.x, MIN_SIZE), h: Math.max(bottom - my, MIN_SIZE) };
    case "e":  return { ...shape, w: Math.max(mx - shape.x, MIN_SIZE) };
    case "se": return { ...shape,
      w: Math.max(mx - shape.x, MIN_SIZE), h: Math.max(my - shape.y, MIN_SIZE) };
    case "s":  return { ...shape, h: Math.max(my - shape.y, MIN_SIZE) };
    case "sw": return { ...shape,
      x: Math.min(mx, right - MIN_SIZE), w: Math.max(right - mx, MIN_SIZE),
      h: Math.max(my - shape.y, MIN_SIZE) };
    case "w":  return { ...shape,
      x: Math.min(mx, right - MIN_SIZE), w: Math.max(right - mx, MIN_SIZE) };
    default:   return shape;
  }
}

function resizeEllipse(shape: EllipseShape, handle: ResizeHandle, mx: number, my: number): EllipseShape {
  const b = getBBox(shape);
  let newX = b.x, newY = b.y, newW = b.w, newH = b.h;
  const right  = b.x + b.w;
  const bottom = b.y + b.h;

  switch (handle) {
    case "nw":
      newX = Math.min(mx, right  - MIN_SIZE); newY = Math.min(my, bottom - MIN_SIZE);
      newW = Math.max(right  - mx, MIN_SIZE); newH = Math.max(bottom - my, MIN_SIZE); break;
    case "n":
      newY = Math.min(my, bottom - MIN_SIZE); newH = Math.max(bottom - my, MIN_SIZE); break;
    case "ne":
      newY = Math.min(my, bottom - MIN_SIZE);
      newW = Math.max(mx - b.x, MIN_SIZE); newH = Math.max(bottom - my, MIN_SIZE); break;
    case "e":  newW = Math.max(mx - b.x, MIN_SIZE); break;
    case "se": newW = Math.max(mx - b.x, MIN_SIZE); newH = Math.max(my - b.y, MIN_SIZE); break;
    case "s":  newH = Math.max(my - b.y, MIN_SIZE); break;
    case "sw":
      newX = Math.min(mx, right - MIN_SIZE); newW = Math.max(right - mx, MIN_SIZE);
      newH = Math.max(my - b.y, MIN_SIZE); break;
    case "w":
      newX = Math.min(mx, right - MIN_SIZE); newW = Math.max(right - mx, MIN_SIZE); break;
    default: break;
  }

  return { ...shape, cx: newX + newW / 2, cy: newY + newH / 2, rx: newW / 2, ry: newH / 2 };
}

function resizeDiamond(shape: DiamondShape, handle: ResizeHandle, mx: number, my: number): DiamondShape {
  const b = getBBox(shape);
  let newX = b.x, newY = b.y, newW = b.w, newH = b.h;
  const right  = b.x + b.w;
  const bottom = b.y + b.h;
  const MIN = 4;

  switch (handle) {
    case "nw": newX = Math.min(mx, right  - MIN); newY = Math.min(my, bottom - MIN); newW = Math.max(right  - mx, MIN); newH = Math.max(bottom - my, MIN); break;
    case "n":  newY = Math.min(my, bottom - MIN); newH = Math.max(bottom - my, MIN); break;
    case "ne": newY = Math.min(my, bottom - MIN); newW = Math.max(mx - b.x, MIN); newH = Math.max(bottom - my, MIN); break;
    case "e":  newW = Math.max(mx - b.x, MIN); break;
    case "se": newW = Math.max(mx - b.x, MIN); newH = Math.max(my - b.y, MIN); break;
    case "s":  newH = Math.max(my - b.y, MIN); break;
    case "sw": newX = Math.min(mx, right - MIN); newW = Math.max(right - mx, MIN); newH = Math.max(my - b.y, MIN); break;
    case "w":  newX = Math.min(mx, right - MIN); newW = Math.max(right - mx, MIN); break;
    default: break;
  }

  return { ...shape, cx: newX + newW / 2, cy: newY + newH / 2, rx: newW / 2, ry: newH / 2 };
}

function resizeLineArrow(shape: LineShape | ArrowShape, handle: ResizeHandle, mx: number, my: number): LineShape | ArrowShape {
  if (handle === "start") return { ...shape, x1: mx, y1: my };
  if (handle === "end")   return { ...shape, x2: mx, y2: my };
  return shape;
}

function resizePencil(shape: PencilShape, handle: ResizeHandle, mx: number, my: number): PencilShape {
  const b = getBBox(shape);
  if (b.w < 1 || b.h < 1) return shape;

  let newX = b.x, newY = b.y, newW = b.w, newH = b.h;
  const right  = b.x + b.w;
  const bottom = b.y + b.h;

  switch (handle) {
    case "nw":
      newX = Math.min(mx, right  - MIN_SIZE); newY = Math.min(my, bottom - MIN_SIZE);
      newW = Math.max(right  - mx, MIN_SIZE); newH = Math.max(bottom - my, MIN_SIZE); break;
    case "n":
      newY = Math.min(my, bottom - MIN_SIZE); newH = Math.max(bottom - my, MIN_SIZE); break;
    case "ne":
      newY = Math.min(my, bottom - MIN_SIZE);
      newW = Math.max(mx - b.x, MIN_SIZE); newH = Math.max(bottom - my, MIN_SIZE); break;
    case "e":  newW = Math.max(mx - b.x, MIN_SIZE); break;
    case "se": newW = Math.max(mx - b.x, MIN_SIZE); newH = Math.max(my - b.y, MIN_SIZE); break;
    case "s":  newH = Math.max(my - b.y, MIN_SIZE); break;
    case "sw":
      newX = Math.min(mx, right - MIN_SIZE); newW = Math.max(right - mx, MIN_SIZE);
      newH = Math.max(my - b.y, MIN_SIZE); break;
    case "w":
      newX = Math.min(mx, right - MIN_SIZE); newW = Math.max(right - mx, MIN_SIZE); break;
    default: return shape;
  }

  const scaleX = newW / b.w;
  const scaleY = newH / b.h;

  return {
    ...shape,
    points: shape.points.map(([x, y]) => [
      newX + (x - b.x) * scaleX,
      newY + (y - b.y) * scaleY,
    ]),
  };
}
