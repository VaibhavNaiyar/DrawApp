"use client";

import styles from "./ZoomControls.module.css";

interface Props {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

export default function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset }: Props) {
  return (
    <div className={styles.container}>
      <button className={styles.btn} onClick={onZoomOut} type="button" title="Zoom out  Ctrl+−">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="3" y1="8" x2="13" y2="8"/>
        </svg>
      </button>
      <button className={styles.pct} onClick={onReset} type="button" title="Reset zoom  Ctrl+0">
        {Math.round(zoom * 100)}%
      </button>
      <button className={styles.btn} onClick={onZoomIn} type="button" title="Zoom in  Ctrl+=">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="8" y1="3" x2="8" y2="13"/>
          <line x1="3" y1="8" x2="13" y2="8"/>
        </svg>
      </button>
    </div>
  );
}
