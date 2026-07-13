"use client";

import { useTheme } from "@/components/ThemeProvider";
import styles from "./ThemeToggle.module.css";

/** Sun icon for dark mode (click → switch to light) */
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

/** Moon icon for light mode (click → switch to dark) */
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

interface ThemeToggleProps {
  /** Visual variant — default is the floating pill; "icon" is a bare icon button */
  variant?: "pill" | "icon";
}

export default function ThemeToggle({ variant = "pill" }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      className={variant === "icon" ? styles.iconBtn : styles.pill}
      onClick={toggle}
      type="button"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
      {variant === "pill" && (
        <span>{isDark ? "Light" : "Dark"}</span>
      )}
    </button>
  );
}
