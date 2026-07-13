"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import styles from "./signin.module.css";
import ThemeToggle from "@/components/ui/ThemeToggle";

export default function SigninPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Could not connect to server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.split}>
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 50 }}>
        <ThemeToggle variant="icon" />
      </div>
      {/* Left art panel */}
      <div className={styles.artPanel}>
        <div className={styles.orb1} />
        <div className={styles.orb2} />

        <div className={styles.artBrand}>
          <span className={styles.artLogo}>
            Draw<span>App</span>
          </span>
        </div>

        <div className={styles.artTagline}>
          <h2 className={styles.artHeading}>
            Create.<br />
            Collaborate.<br />
            <em>Together.</em>
          </h2>
          <p className={styles.artSub}>
            Real-time drawing and chat rooms built for seamless creative collaboration.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className={styles.formPanel}>
        <div className={styles.formBox}>
          <h1 className={styles.title}>Welcome back</h1>
          <p className={styles.subtitle}>Sign in to continue to DrawApp</p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input
                className={styles.input}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Password</label>
              <input
                className={styles.input}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button className={styles.button} type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign In →"}
            </button>
          </form>

          <p className={styles.footer}>
            No account?{" "}
            <Link href="/signup" className={styles.link}>
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
