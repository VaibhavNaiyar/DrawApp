import type { DrawingShape } from "./types";

// ─── Bounding box ─────────────────────────────────────────────────────────────

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function getBBox(shape: DrawingShape): BBox {
  switch (shape.type) {
    case "rect":
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };

    case "ellipse":
      return {
        x: shape.cx - shape.rx,
        y: shape.cy - shape.ry,
        w: shape.rx * 2,
        h: shape.ry * 2,
      };

    case "line":
    case "arrow": {
      const minX = Math.min(shape.x1, shape.x2);
      const minY = Math.min(shape.y1, shape.y2);
      return {
        x: minX,
        y: minY,
        w: Math.abs(shape.x2 - shape.x1),
        h: Math.abs(shape.y2 - shape.y1),
      };
    }

    case "pencil": {
      if (!shape.points.length) return { x: 0, y: 0, w: 0, h: 0 };
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const [px, py] of shape.points) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
  }
}

// ─── Hit testing ──────────────────────────────────────────────────────────────

const EDGE_TOLERANCE = 8; // px — how close to an edge counts as a hit

/**
 * Returns the topmost shape that contains point (px, py), or null.
 * Iterates in reverse so the last-drawn (visually top) shape wins.
 */
export function hitTest(
  shapes: DrawingShape[],
  px: number,
  py: number
): DrawingShape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    if (!shape) continue;
    if (isHit(shape, px, py)) return shape;
  }
  return null;
}

function isHit(shape: DrawingShape, px: number, py: number): boolean {
  switch (shape.type) {
    case "rect":
      return isHitRect(shape, px, py);
    case "ellipse":
      return isHitEllipse(shape, px, py);
    case "line":
    case "arrow":
      return distToSegment(px, py, shape.x1, shape.y1, shape.x2, shape.y2) <= EDGE_TOLERANCE + shape.strokeWidth;
    case "pencil":
      return isHitPencil(shape, px, py);
  }
}

function isHitRect(
  shape: { x: number; y: number; w: number; h: number; fillColor: string; strokeWidth: number },
  px: number,
  py: number
): boolean {
  const t = EDGE_TOLERANCE + shape.strokeWidth;
  const inside =
    px >= shape.x - t &&
    px <= shape.x + shape.w + t &&
    py >= shape.y - t &&
    py <= shape.y + shape.h + t;

  if (!inside) return false;

  // For unfilled rects, only the border area is clickable
  if (shape.fillColor === "transparent") {
    const onEdge =
      px <= shape.x + t ||
      px >= shape.x + shape.w - t ||
      py <= shape.y + t ||
      py >= shape.y + shape.h - t;
    return onEdge;
  }

  return true;
}

function isHitEllipse(
  shape: { cx: number; cy: number; rx: number; ry: number; fillColor: string },
  px: number,
  py: number
): boolean {
  if (shape.rx === 0 || shape.ry === 0) return false;
  const dx = (px - shape.cx) / (shape.rx + EDGE_TOLERANCE);
  const dy = (py - shape.cy) / (shape.ry + EDGE_TOLERANCE);
  const d = dx * dx + dy * dy;

  if (shape.fillColor === "transparent") {
    // Only the ring, not the interior
    const innerDx = (px - shape.cx) / (shape.rx - EDGE_TOLERANCE);
    const innerDy = (py - shape.cy) / (shape.ry - EDGE_TOLERANCE);
    return d <= 1 && innerDx * innerDx + innerDy * innerDy >= 1;
  }

  return d <= 1;
}

function isHitPencil(
  shape: { points: [number, number][]; strokeWidth: number },
  px: number,
  py: number
): boolean {
  const threshold = (shape.strokeWidth + EDGE_TOLERANCE) * 2;
  for (let i = 0; i < shape.points.length - 1; i++) {
    const a = shape.points[i];
    const b = shape.points[i + 1];
    if (!a || !b) continue;
    if (distToSegment(px, py, a[0], a[1], b[0], b[1]) <= threshold) {
      return true;
    }
  }
  return false;
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return Math.hypot(px - x1, py - y1);

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
