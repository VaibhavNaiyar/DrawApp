"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import styles from "./signup.module.css";
import ThemeToggle from "@/components/ui/ThemeToggle";

export default function SignupPage() {
  const [name, setName] = useState("");
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
      // 1. Create the account
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Sign up failed");
        return;
      }

      // 2. Sign in automatically after successful registration
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Account created — please sign in manually.");
        router.push("/signin");
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
            Your canvas.<br />
            Your crew.<br />
            <em>Anytime.</em>
          </h2>
          <p className={styles.artSub}>
            Invite anyone, draw in real time, and chat — all in one shared space.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className={styles.formPanel}>
        <div className={styles.formBox}>
          <h1 className={styles.title}>Create account</h1>
          <p className={styles.subtitle}>Join DrawApp and start collaborating</p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Name</label>
              <input
                className={styles.input}
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input
                className={styles.input}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Password</label>
              <input
                className={styles.input}
                type="password"
                placeholder="Min 6 chars, with letter, number & symbol"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button className={styles.button} type="submit" disabled={loading}>
              {loading ? "Creating account..." : "Create Account →"}
            </button>
          </form>

          <p className={styles.footer}>
            Already have an account?{" "}
            <Link href="/signin" className={styles.link}>
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
