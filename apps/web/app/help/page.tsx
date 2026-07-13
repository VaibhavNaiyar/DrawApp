"use client";

import { useRouter } from "next/navigation";
import styles from "./help.module.css";
import ThemeToggle from "@/components/ui/ThemeToggle";

const tools = [
  { key: "P", icon: "✏️", name: "Pencil", desc: "Freehand drawing with pressure-sensitive strokes" },
  { key: "R", icon: "▭", name: "Rectangle", desc: "Draw rectangles and squares" },
  { key: "E", icon: "◯", name: "Ellipse", desc: "Draw circles and ellipses" },
  { key: "D", icon: "◇", name: "Diamond", desc: "Draw diamond shapes" },
  { key: "L", icon: "╱", name: "Line", desc: "Draw straight lines" },
  { key: "A", icon: "→", name: "Arrow", desc: "Draw arrows — curve by dragging in an arc" },
  { key: "T", icon: "T", name: "Text", desc: "Click anywhere to type. Uses handwritten font." },
  { key: "S", icon: "⊹", name: "Select", desc: "Select, move, and resize shapes. Drag to pan." },
];

const shortcuts = [
  { keys: ["Ctrl", "Z"], action: "Undo" },
  { keys: ["Ctrl", "Y"], action: "Redo" },
  { keys: ["Delete"], action: "Delete selected shape" },
  { keys: ["Esc"], action: "Deselect / cancel" },
  { keys: ["P"], action: "Pencil tool" },
  { keys: ["R"], action: "Rectangle tool" },
  { keys: ["E"], action: "Ellipse tool" },
  { keys: ["D"], action: "Diamond tool" },
  { keys: ["L"], action: "Line tool" },
  { keys: ["A"], action: "Arrow tool" },
  { keys: ["T"], action: "Text tool" },
  { keys: ["S"], action: "Select tool" },
];

const canvasNav = [
  { action: "Pan canvas", how: "Select tool → drag on empty space" },
  { action: "Move shape", how: "Select tool → drag the shape" },
  { action: "Resize shape", how: "Select shape → drag any of the 8 corner/edge handles" },
  { action: "Curved arrow", how: "Draw an arrow in a curve — it auto-detects the bend" },
  { action: "Edit text", how: "Double-click any text shape to edit" },
  { action: "Fill color", how: "Select a shape → change fill in the toolbar" },
];

export default function HelpPage() {
  const router = useRouter();

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.back} onClick={() => router.back()} type="button">
          ← back
        </button>
        <ThemeToggle variant="icon" />
      </div>

      <main className={styles.content}>
        <header className={styles.hero}>
          <h1 className={styles.title}>How DrawApp works</h1>
          <p className={styles.sub}>Everything you need to know to start drawing.</p>
        </header>

        {/* Tools */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Tools</h2>
          <div className={styles.toolGrid}>
            {tools.map((t) => (
              <div key={t.key} className={styles.toolCard}>
                <div className={styles.toolTop}>
                  <span className={styles.toolIcon}>{t.icon}</span>
                  <span className={styles.toolName}>{t.name}</span>
                  <kbd className={styles.kbd}>{t.key}</kbd>
                </div>
                <p className={styles.toolDesc}>{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Canvas navigation */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Canvas controls</h2>
          <div className={styles.navList}>
            {canvasNav.map((n) => (
              <div key={n.action} className={styles.navRow}>
                <span className={styles.navAction}>{n.action}</span>
                <span className={styles.navHow}>{n.how}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Keyboard shortcuts */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Keyboard shortcuts</h2>
          <div className={styles.shortcutGrid}>
            {shortcuts.map((s) => (
              <div key={s.action} className={styles.shortcutRow}>
                <span className={styles.shortcutAction}>{s.action}</span>
                <span className={styles.shortcutKeys}>
                  {s.keys.map((k, i) => (
                    <span key={k}>
                      <kbd className={styles.kbd}>{k}</kbd>
                      {i < s.keys.length - 1 && <span className={styles.plus}>+</span>}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Collaboration */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Collaboration</h2>
          <div className={styles.navList}>
            <div className={styles.navRow}>
              <span className={styles.navAction}>Create a room</span>
              <span className={styles.navHow}>Dashboard → Create Room</span>
            </div>
            <div className={styles.navRow}>
              <span className={styles.navAction}>Invite others</span>
              <span className={styles.navHow}>Click "Copy Link" in the room badge — shares the E2EE key too</span>
            </div>
            <div className={styles.navRow}>
              <span className={styles.navAction}>Join a room</span>
              <span className={styles.navHow}>Dashboard → Join Room → paste the room ID</span>
            </div>
            <div className={styles.navRow}>
              <span className={styles.navAction}>End-to-end encryption</span>
              <span className={styles.navHow}>All shapes are encrypted in your browser — the server never sees your drawings</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
