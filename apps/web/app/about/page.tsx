"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import styles from "./about.module.css";
import ThemeToggle from "@/components/ui/ThemeToggle";

const skills = [
  "Next.js", "TypeScript", "Node.js", "React",
  "PostgreSQL", "WebSockets", "WebRTC", "Docker",
  "CI/CD", "Solidity", "AI / LLMs", "DevOps",
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

        {/* ── Hero: photo + name side by side ── */}
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <span className={styles.eyebrow}>a project by</span>
            <h1 className={styles.name}>Vaibhav</h1>
            <p className={styles.designation}>Full-Stack Engineer</p>
            <p className={styles.bio}>
              I&apos;m a software engineer focused on turning complex problems into simple,
              scalable solutions. Working independently, I&apos;ve built everything from
              high-traffic learning platforms to real-time video networks using Next.js,
              Node.js, PostgreSQL, and modern DevOps tools. Currently diving deep into
              Generative AI and agentic workflows, exploring how large language models can
              power smarter applications. When I&apos;m not optimizing APIs, contributing to
              open-source startups, or experimenting with AI, you can usually find me on
              the football field.
            </p>
          </div>

          <div className={styles.photoWrap}>
            <Image
              src="/vaibhav.jpeg"
              alt="Vaibhav"
              width={260}
              height={310}
              className={styles.photo}
              priority
            />
          </div>
        </section>

        {/* ── Skills ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Skills</h2>
          <div className={styles.skillsGrid}>
            {skills.map((s) => (
              <span key={s} className={styles.skillPill}>{s}</span>
            ))}
          </div>
        </section>

        {/* ── About DrawApp ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>About DrawApp</h2>
          <p className={styles.body}>
            DrawApp is a real-time collaborative whiteboard built from scratch. Create a room,
            share a link, and draw together — shapes, arrows, freehand, text — all synced live
            and encrypted end-to-end so only people with the link can see your work.
          </p>
          <p className={styles.body}>
            Built with Next.js 15, TypeScript, Rough.js, WebSockets, Prisma, and the Web Crypto
            API in a Turborepo monorepo.
          </p>
        </section>

        {/* ── Links ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Find me</h2>
          <div className={styles.links}>
            <a className={styles.link} href="https://github.com/VaibhavNaiyar" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M10 0C4.477 0 0 4.477 0 10c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0110 4.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C17.138 18.163 20 14.417 20 10c0-5.523-4.477-10-10-10z" clipRule="evenodd"/>
              </svg>
              GitHub
            </a>
            <a className={styles.link} href="https://www.linkedin.com/in/vaibhav-naiyar-07b817291/" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M16.338 16.338H13.67V12.16c0-.995-.017-2.277-1.387-2.277-1.39 0-1.601 1.086-1.601 2.207v4.248H8.014v-8.59h2.559v1.174h.037c.356-.675 1.227-1.387 2.526-1.387 2.703 0 3.203 1.778 3.203 4.092v4.711zM5.005 6.575a1.548 1.548 0 11-.003-3.096 1.548 1.548 0 01.003 3.096zm-1.337 9.763H6.34v-8.59H3.667v8.59zM17.668 1H2.328C1.595 1 1 1.581 1 2.298v15.403C1 18.418 1.595 19 2.328 19h15.34c.734 0 1.332-.582 1.332-1.299V2.298C19 1.581 18.402 1 17.668 1z"/>
              </svg>
              LinkedIn
            </a>
            <a className={styles.link} href="https://x.com/VaibhavNaiyar" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M11.176 8.897L17.6 1.5h-1.522L10.49 7.955 6.035 1.5H1.5l6.74 9.804L1.5 18.5h1.522l5.894-6.854 4.71 6.854H18.5l-7.324-9.603zM9.64 10.78l-.683-.977L3.56 2.64h2.34l4.388 6.274.683.977 5.7 8.155h-2.34L9.64 10.78z"/>
              </svg>
              X / Twitter
            </a>
            <a className={styles.link} href="mailto:naiyarvaibhav@gmail.com">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <rect x="2" y="4" width="16" height="12" rx="2"/>
                <path d="M2 7l8 5 8-5" strokeLinecap="round"/>
              </svg>
              Email
            </a>
            <a className={styles.link} href="https://my-portfolio-page-ruby.vercel.app/" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <circle cx="10" cy="10" r="8"/>
                <path d="M10 2c0 0-4 3-4 8s4 8 4 8M10 2c0 0 4 3 4 8s-4 8-4 8M2 10h16" strokeLinecap="round"/>
              </svg>
              Portfolio
            </a>
          </div>
        </section>

      </main>
    </div>
  );
}
