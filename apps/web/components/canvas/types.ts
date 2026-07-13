// ─── Tools ────────────────────────────────────────────────────────────────────

export type Tool =
  | "select"
  | "pencil"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "eraser"
  | "text"
  | "diamond";

// ─── Shapes ───────────────────────────────────────────────────────────────────

interface ShapeBase {
  id: string;
  strokeColor: string;
  strokeWidth: number;
}

export type PencilShape = ShapeBase & {
  type: "pencil";
  // Each point is [x, y] — compatible with perfect-freehand's input format
  points: [number, number][];
};

export type RectShape = ShapeBase & {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  fillColor: string; // "transparent" means no fill
};

export type EllipseShape = ShapeBase & {
  type: "ellipse";
  cx: number;
  cy: number;
  rx: number; // half-width
  ry: number; // half-height
  fillColor: string;
};

export type LineShape = ShapeBase & {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type ArrowShape = ShapeBase & {
  type: "arrow";
  x1: number; y1: number;
  x2: number; y2: number;
  /** Optional bezier control point — present when arrow is curved */
  cx?: number; cy?: number;
};

export type TextShape = ShapeBase & {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
};

export type DiamondShape = ShapeBase & {
  type: "diamond";
  cx: number;
  cy: number;
  rx: number; // half-width
  ry: number; // half-height
  fillColor: string;
};

export type DrawingShape =
  | PencilShape
  | RectShape
  | EllipseShape
  | LineShape
  | ArrowShape
  | TextShape
  | DiamondShape;

// ─── Toolbar state ────────────────────────────────────────────────────────────

export interface CanvasSettings {
  strokeColor: string;
  fillColor: string; // "transparent" = no fill
  strokeWidth: number;
  fontSize: number;  // used by text tool
}

// ─── Select-tool drag state (held in a ref, not React state) ──────────────────

export interface DragState {
  shapeId: string;
  startMouseX: number;
  startMouseY: number;
  /** Deep copy of the shape at drag-start so we always apply total delta, not incremental */
  snapshot: DrawingShape;
}

// ─── Resize handle identifiers ────────────────────────────────────────────────

/** 8 corner/edge handles for closed shapes; "start"/"end" for line and arrow */
export type ResizeHandle =
  | "nw" | "n" | "ne"
  | "e"  |        "w"
  | "sw" | "s" | "se"
  | "start" | "end";

export interface ResizeState {
  shapeId: string;
  handle: ResizeHandle;
  /** Snapshot of the shape at the moment the handle was grabbed */
  snapshot: DrawingShape;
}

// ─── Remote cursor presence ────────────────────────────────────────────────────

export interface RemoteCursor {
  connectionId: string;
  userId: string;
  userName: string;
  /** Cursor color derived from userId — stable per user across sessions */
  color: string;
  /** Canvas-element-relative coordinates in px */
  x: number;
  y: number;
}
