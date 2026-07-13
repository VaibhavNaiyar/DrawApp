/**
 * Pure rendering module — knows nothing about React.
 * Called imperatively from DrawCanvas useEffect and mouse handlers.
 */
import rough from "roughjs";
import type { RoughCanvas } from "roughjs/bin/canvas";
import getStroke from "perfect-freehand";
import type { DrawingShape } from "./types";
import { getBBox, getHandlePositions } from "./hitTest";

const CANVAS_BG = "#06060a";
const SELECTION_COLOR = "#7c3aed";
const ROUGHNESS = 1.2;
const ARROW_HEAD_LEN = 14;
const ARROW_HEAD_ANGLE = 0.42; // ~24 degrees in radians
const TEXT_LINE_HEIGHT = 1.4; // multiplier of fontSize

// ─── Public API ───────────────────────────────────────────────────────────────

/** Create a RoughCanvas instance. Call once on mount, keep in a ref. */
export function createRoughCanvas(canvas: HTMLCanvasElement): RoughCanvas {
  return rough.canvas(canvas);
}

/**
 * Full redraw. Clears the canvas, fills background, then renders all shapes
 * plus an optional selection highlight.
 */
export function renderCanvas(
  ctx: CanvasRenderingContext2D,
  shapes: DrawingShape[],
  rc: RoughCanvas,
  selectedId: string | null
): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  // Fill with the app's dark background
  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, width, height);

  for (const shape of shapes) {
    renderShape(ctx, rc, shape);
    if (shape.id === selectedId) {
      renderSelectionBox(ctx, shape);
    }
  }
}

// ─── Shape rendering ──────────────────────────────────────────────────────────

function renderShape(
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  shape: DrawingShape
): void {
  switch (shape.type) {
    case "rect": {
      const hasFill = shape.fillColor !== "transparent";
      rc.rectangle(shape.x, shape.y, shape.w, shape.h, {
        stroke: shape.strokeColor,
        strokeWidth: shape.strokeWidth,
        fill: hasFill ? shape.fillColor : undefined,
        fillStyle: hasFill ? "solid" : "hachure",
        roughness: ROUGHNESS,
      });
      break;
    }

    case "ellipse": {
      const hasFill = shape.fillColor !== "transparent";
      rc.ellipse(shape.cx, shape.cy, shape.rx * 2, shape.ry * 2, {
        stroke: shape.strokeColor,
        strokeWidth: shape.strokeWidth,
        fill: hasFill ? shape.fillColor : undefined,
        fillStyle: hasFill ? "solid" : "hachure",
        roughness: ROUGHNESS,
      });
      break;
    }

    case "line":
      rc.line(shape.x1, shape.y1, shape.x2, shape.y2, {
        stroke: shape.strokeColor,
        strokeWidth: shape.strokeWidth,
        roughness: ROUGHNESS,
      });
      break;

    case "arrow":
      renderArrow(ctx, rc, shape);
      break;

    case "pencil":
      renderPencil(ctx, shape);
      break;

    case "text":
      renderText(ctx, shape);
      break;
  }
}

function renderArrow(
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  shape: { x1: number; y1: number; x2: number; y2: number; strokeColor: string; strokeWidth: number }
): void {
  rc.line(shape.x1, shape.y1, shape.x2, shape.y2, {
    stroke: shape.strokeColor,
    strokeWidth: shape.strokeWidth,
    roughness: 0.5, // less roughness so the arrow tip looks intentional
  });

  const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);

  ctx.beginPath();
  ctx.moveTo(shape.x2, shape.y2);
  ctx.lineTo(
    shape.x2 - ARROW_HEAD_LEN * Math.cos(angle - ARROW_HEAD_ANGLE),
    shape.y2 - ARROW_HEAD_LEN * Math.sin(angle - ARROW_HEAD_ANGLE)
  );
  ctx.moveTo(shape.x2, shape.y2);
  ctx.lineTo(
    shape.x2 - ARROW_HEAD_LEN * Math.cos(angle + ARROW_HEAD_ANGLE),
    shape.y2 - ARROW_HEAD_LEN * Math.sin(angle + ARROW_HEAD_ANGLE)
  );
  ctx.strokeStyle = shape.strokeColor;
  ctx.lineWidth = shape.strokeWidth;
  ctx.lineCap = "round";
  ctx.stroke();
}

function renderPencil(
  ctx: CanvasRenderingContext2D,
  shape: { points: [number, number][]; strokeColor: string; strokeWidth: number }
): void {
  if (shape.points.length < 2) {
    // Just a dot
    const pt = shape.points[0];
    if (!pt) return;
    ctx.beginPath();
    ctx.arc(pt[0], pt[1], shape.strokeWidth, 0, Math.PI * 2);
    ctx.fillStyle = shape.strokeColor;
    ctx.fill();
    return;
  }

  const stroke = getStroke(shape.points, {
    size: shape.strokeWidth * 2.5,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: true,
  });

  if (!stroke.length) return;

  const pathData = strokeToSvgPath(stroke);
  const path = new Path2D(pathData);
  ctx.fillStyle = shape.strokeColor;
  ctx.fill(path);
}

/** Converts perfect-freehand output to an SVG path string for Path2D. */
function strokeToSvgPath(stroke: number[][]): string {
  if (!stroke.length) return "";

  const first = stroke[0];
  if (!first) return "";

  const parts: string[] = [`M ${first[0] ?? 0},${first[1] ?? 0} Q`];

  for (let i = 0; i < stroke.length - 1; i++) {
    const curr = stroke[i];
    const next = stroke[i + 1];
    if (!curr || !next) continue;

    const cx = curr[0] ?? 0;
    const cy = curr[1] ?? 0;
    const nx = next[0] ?? 0;
    const ny = next[1] ?? 0;

    parts.push(`${cx},${cy} ${(cx + nx) / 2},${(cy + ny) / 2}`);
  }

  parts.push("Z");
  return parts.join(" ");
}

function renderText(
  ctx: CanvasRenderingContext2D,
  shape: { x: number; y: number; text: string; fontSize: number; strokeColor: string }
): void {
  ctx.save();
  ctx.font = `${shape.fontSize}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = shape.strokeColor;
  ctx.textBaseline = "top";
  const lines = shape.text.split("\n");
  const lineHeight = shape.fontSize * TEXT_LINE_HEIGHT;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i] ?? "", shape.x, shape.y + i * lineHeight);
  }
  ctx.restore();
}

// ─── Selection box + resize handles ──────────────────────────────────────────

const HANDLE_SIZE = 7; // half-side of each handle square in px

function renderSelectionBox(
  ctx: CanvasRenderingContext2D,
  shape: DrawingShape
): void {
  // For line/arrow: skip the bounding-box rect, just show endpoint handles
  if (shape.type !== "line" && shape.type !== "arrow") {
    const PAD = 8;
    const bbox = getBBox(shape);

    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      bbox.x - PAD,
      bbox.y - PAD,
      bbox.w + PAD * 2,
      bbox.h + PAD * 2
    );
    ctx.restore();
  }

  // Draw resize handles
  const handles = getHandlePositions(shape);
  ctx.save();
  ctx.setLineDash([]);
  for (const { x, y } of handles) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.5;
    ctx.fillRect(x - HANDLE_SIZE, y - HANDLE_SIZE, HANDLE_SIZE * 2, HANDLE_SIZE * 2);
    ctx.strokeRect(x - HANDLE_SIZE, y - HANDLE_SIZE, HANDLE_SIZE * 2, HANDLE_SIZE * 2);
  }
  ctx.restore();
}
