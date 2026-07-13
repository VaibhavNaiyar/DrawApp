"use client";

import { useRouter } from "next/navigation";
import styles from "./about.module.css";
import ThemeToggle from "@/components/ui/ThemeToggle";

const stack = [
  { name: "Next.js 15", role: "Frontend framework (App Router)" },
  { name: "TypeScript", role: "Type safety across the monorepo" },
  { name: "Rough.js", role: "Hand-drawn shape rendering" },
  { name: "perfect-freehand", role: "Pressure-sensitive pencil strokes" },
  { name: "WebSockets", role: "Real-time collaboration" },
  { name: "Prisma + PostgreSQL", role: "Room and shape persistence" },
  { name: "NextAuth v5", role: "JWT authentication" },
  { name: "Web Crypto API", role: "End-to-end encryption (E2EE)" },
  { name: "Turborepo + pnpm", role: "Monorepo tooling" },
];

export default function AboutPage() {
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

        {/* Hero — signature element: large handwritten "made by" */}
        <header className={styles.hero}>
          <span className={styles.eyebrow}>a project by</span>
          <h1 className={styles.name}>Your Name Here</h1>
          <p className={styles.tagline}>
            Replace this with a one-liner about yourself — who you are, what you build.
          </p>
        </header>

        {/* About me */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>About me</h2>
          <p className={styles.body}>
            Write a few sentences about yourself here — your background, interests, and what
            drives you to build things. This is your space to let people know who made this.
          </p>
          <p className={styles.body}>
            You can talk about your journey in tech, side projects you love, or anything else
            you want the world to know.
          </p>
        </section>

        {/* About the project */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>About DrawApp</h2>
          <p className={styles.body}>
            DrawApp is a real-time collaborative whiteboard built from scratch. You can create
            a room, share a link, and draw together — shapes, arrows, freehand, text — all
            synced live and encrypted end-to-end so only people with the link can see your work.
          </p>
          <p className={styles.body}>
            The goal was to build something that feels as natural as picking up a pen, with the
            rough hand-drawn aesthetic of Excalidraw and the real-time feel of Figma.
          </p>
        </section>

        {/* Tech stack */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Built with</h2>
          <div className={styles.stackGrid}>
            {stack.map((item) => (
              <div key={item.name} className={styles.stackItem}>
                <span className={styles.stackName}>{item.name}</span>
                <span className={styles.stackRole}>{item.role}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Links */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Find me</h2>
          <div className={styles.links}>
            <a className={styles.link} href="https://github.com/" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M10 0C4.477 0 0 4.477 0 10c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0110 4.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C17.138 18.163 20 14.417 20 10c0-5.523-4.477-10-10-10z" clipRule="evenodd"/>
              </svg>
              GitHub
            </a>
            <a className={styles.link} href="https://twitter.com/" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M6.29 18.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0020 3.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.073 4.073 0 01.8 7.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 010 16.407a11.616 11.616 0 006.29 1.84"/>
              </svg>
              Twitter / X
            </a>
            <a className={styles.link} href="mailto:you@example.com">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <rect x="2" y="4" width="16" height="12" rx="2"/>
                <path d="M2 7l8 5 8-5" strokeLinecap="round"/>
              </svg>
              Email me
            </a>
          </div>
        </section>

      </main>
    </div>
  );
}
