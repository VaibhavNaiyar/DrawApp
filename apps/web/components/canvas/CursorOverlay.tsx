"use client";

import type { RemoteCursor } from "./types";
import styles from "./CursorOverlay.module.css";

interface Props {
  cursors: Map<string, RemoteCursor>;
  myConnectionId: string | null;
}

/**
 * Renders remote users' cursors as absolutely-positioned labels on top of the
 * canvas container. Coordinates are in canvas-element space (px from top-left).
 */
export default function CursorOverlay({ cursors, myConnectionId }: Props) {
  return (
    <>
      {Array.from(cursors.values())
        .filter((c) => c.connectionId !== myConnectionId)
        .map((cursor) => (
          <div
            key={cursor.connectionId}
            className={styles.cursor}
            style={{ left: cursor.x, top: cursor.y }}
          >
            <svg
              className={styles.pointer}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M1 1l5.5 13.5 2-5.5 5.5-2z"
                fill={cursor.color}
                stroke="#fff"
                strokeWidth="1"
              />
            </svg>
            <span className={styles.label} style={{ background: cursor.color }}>
              {cursor.userName}
            </span>
          </div>
        ))}
    </>
  );
}
