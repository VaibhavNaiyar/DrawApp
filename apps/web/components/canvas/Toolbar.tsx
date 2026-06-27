"use client";

import styles from "./Toolbar.module.css";
import type { Tool, CanvasSettings } from "./types";

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: { id: Tool; tip: string; icon: React.ReactNode }[] = [
  {
    id: "select",
    tip: "Select  [S]",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M5.5 3.5l13 8.5-6 1.5-3 5.5-4-15.5z" />
      </svg>
    ),
  },
  {
    id: "pencil",
    tip: "Pencil  [P]",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    ),
  },
  {
    id: "rect",
    tip: "Rectangle  [R]",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="1.5" />
      </svg>
    ),
  },
  {
    id: "ellipse",
    tip: "Ellipse  [E]",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <ellipse cx="12" cy="12" rx="10" ry="7" />
      </svg>
    ),
  },
  {
    id: "line",
    tip: "Line  [L]",
    icon: (
      <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="4" y1="20" x2="20" y2="4" />
      </svg>
    ),
  },
  {
    id: "arrow",
    tip: "Arrow  [A]",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    ),
  },
  {
    id: "eraser",
    tip: "Eraser  [X]",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 20H7L3 16l11-11 7 7-1 8z" />
        <line x1="6" y1="14" x2="14" y2="20" />
      </svg>
    ),
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface ToolbarProps {
  activeTool: Tool;
  settings: CanvasSettings;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (t: Tool) => void;
  onSettingsChange: (patch: Partial<CanvasSettings>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

export default function Toolbar({
  activeTool,
  settings,
  canUndo,
  canRedo,
  onToolChange,
  onSettingsChange,
  onUndo,
  onRedo,
  onClear,
}: ToolbarProps) {
  return (
    <div className={styles.toolbar}>
      {/* Tool buttons */}
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          className={`${styles.toolBtn} ${activeTool === tool.id ? styles.active : ""}`}
          onClick={() => onToolChange(tool.id)}
          data-tip={tool.tip}
          type="button"
        >
          {tool.icon}
        </button>
      ))}

      <div className={styles.divider} />

      {/* Stroke color */}
      <div className={styles.colorSection}>
        <span className={styles.colorLabel}>stroke</span>
        <div
          className={styles.colorSwatch}
          style={{ background: settings.strokeColor }}
        >
          <input
            type="color"
            value={settings.strokeColor}
            onChange={(e) => onSettingsChange({ strokeColor: e.target.value })}
            title="Stroke color"
          />
        </div>
      </div>

      {/* Fill color */}
      <div className={styles.colorSection}>
        <span className={styles.colorLabel}>fill</span>
        <div
          className={styles.colorSwatch}
          style={{
            background:
              settings.fillColor === "transparent"
                ? "repeating-linear-gradient(45deg,rgba(255,255,255,0.08) 0px,rgba(255,255,255,0.08) 3px,transparent 3px,transparent 8px)"
                : settings.fillColor,
          }}
        >
          {settings.fillColor !== "transparent" && (
            <input
              type="color"
              value={settings.fillColor}
              onChange={(e) => onSettingsChange({ fillColor: e.target.value })}
              title="Fill color"
            />
          )}
        </div>
        {/* Toggle transparent fill */}
        <button
          className={`${styles.transparentBtn} ${settings.fillColor === "transparent" ? styles.active : ""}`}
          onClick={() =>
            onSettingsChange({
              fillColor:
                settings.fillColor === "transparent" ? "#ffffff" : "transparent",
            })
          }
          title="No fill"
          type="button"
        />
      </div>

      <div className={styles.divider} />

      {/* Stroke width */}
      <div className={styles.widthSection}>
        <span className={styles.colorLabel}>width</span>
        <input
          type="range"
          min="1"
          max="20"
          step="1"
          value={settings.strokeWidth}
          onChange={(e) =>
            onSettingsChange({ strokeWidth: Number(e.target.value) })
          }
          className={styles.widthSlider}
          title={`Stroke width: ${settings.strokeWidth}px`}
        />
      </div>

      <div className={styles.divider} />

      {/* Undo */}
      <button
        className={styles.actionBtn}
        onClick={onUndo}
        disabled={!canUndo}
        data-tip="Undo  [Ctrl+Z]"
        type="button"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7v6h6" />
          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
        </svg>
      </button>

      {/* Redo */}
      <button
        className={styles.actionBtn}
        onClick={onRedo}
        disabled={!canRedo}
        data-tip="Redo  [Ctrl+Shift+Z]"
        type="button"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 7v6h-6" />
          <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
        </svg>
      </button>

      {/* Clear */}
      <button
        className={`${styles.actionBtn} ${styles.clearBtn}`}
        onClick={onClear}
        data-tip="Clear canvas"
        type="button"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4h6v2" />
        </svg>
      </button>
    </div>
  );
}
