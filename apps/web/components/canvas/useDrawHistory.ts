import { useRef, useState } from "react";
import type { DrawingShape } from "./types";

/**
 * pos+historyRef pattern:
 * - historyRef stores the full undo/redo stack (mutated directly, no re-render cost)
 * - pos is React state that mirrors historyRef's current index, triggering re-renders
 *
 * Reading shapes: historyRef.current[pos] (always valid because pos is clamped on write)
 */
export function useDrawHistory() {
  const historyRef = useRef<DrawingShape[][]>([[]]); // stack of committed snapshots
  const [pos, setPos] = useState(0); // current index — changing this triggers re-render

  // What's visible right now
  const shapes: DrawingShape[] = historyRef.current[pos] ?? [];

  /** Push a new state onto the history stack (truncates any redo future). */
  function commit(next: DrawingShape[]) {
    const newStack = historyRef.current.slice(0, pos + 1);
    newStack.push(next);
    historyRef.current = newStack;
    setPos(newStack.length - 1);
  }

  function undo() {
    setPos((p) => Math.max(0, p - 1));
  }

  function redo() {
    setPos((p) => Math.min(historyRef.current.length - 1, p + 1));
  }

  function clear() {
    commit([]);
  }

  return {
    shapes,
    commit,
    undo,
    redo,
    clear,
    canUndo: pos > 0,
    canRedo: pos < historyRef.current.length - 1,
  };
}
