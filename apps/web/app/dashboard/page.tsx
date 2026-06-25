"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import styles from "./dashboard.module.css";

export default function DashboardPage() {
  const [roomId, setRoomId] = useState("");
  const [joinError, setJoinError] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);

    try {
      const tokenRes = await fetch("/api/auth/token");
      if (!tokenRes.ok) {
        router.push("/signin");
        return;
      }
      const { token } = await tokenRes.json();

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_HTTP_URL || "http://localhost:3001"}/room`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setCreateError(data.message || "Failed to create room");
        return;
      }

      router.push(`/room/${data.roomId}`);
    } catch {
      setCreateError("Could not connect to server");
    } finally {
      setCreating(false);
    }
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const id = roomId.trim();
    if (!id) {
      setJoinError("Please enter a room ID");
      return;
    }
    router.push(`/room/${id}`);
  }

  async function handleSignout() {
    await signOut({ redirect: false });
    router.push("/signin");
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.logo}>
          Draw<span>App</span>
        </h1>
        <button className={styles.signout} onClick={handleSignout}>
          Sign Out
        </button>
      </header>

      <main className={styles.main}>
        <div className={styles.grid}>
          {/* Create Room */}
          <div className={styles.card}>
            <div className={styles.cardIcon}>+</div>
            <h2 className={styles.cardTitle}>Create a Room</h2>
            <p className={styles.cardSub}>Start a new collaborative space</p>
            <form onSubmit={handleCreate} className={styles.form}>
              {createError && <p className={styles.error}>{createError}</p>}
              <button className={styles.button} type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create Room →"}
              </button>
            </form>
          </div>

          {/* Join Room */}
          <div className={styles.card}>
            <div className={styles.cardIcon}>#</div>
            <h2 className={styles.cardTitle}>Join a Room</h2>
            <p className={styles.cardSub}>Enter an existing room ID</p>
            <form onSubmit={handleJoin} className={styles.form}>
              <input
                className={styles.input}
                type="text"
                placeholder="Paste room ID here"
                value={roomId}
                onChange={(e) => {
                  setJoinError("");
                  setRoomId(e.target.value);
                }}
              />
              {joinError && <p className={styles.error}>{joinError}</p>}
              <button
                className={`${styles.button} ${styles.buttonOutline}`}
                type="submit"
              >
                Join Room →
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
