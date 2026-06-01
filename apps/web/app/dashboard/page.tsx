"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./dashboard.module.css";

export default function DashboardPage() {
  const [roomId, setRoomId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [joinError, setJoinError] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/signin");
    }
  }, [router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    const name = roomName.trim();
    if (!name) {
      setCreateError("Please enter a room name");
      return;
    }
    setCreating(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("http://localhost:3001/room", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ slug: name }),
      });
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

  function handleSignout() {
    localStorage.removeItem("token");
    router.push("/signin");
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.logo}>Draw<span>App</span></h1>
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
              <input
                className={styles.input}
                type="text"
                placeholder="e.g. design-session"
                value={roomName}
                onChange={(e) => { setCreateError(""); setRoomName(e.target.value); }}
              />
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
            <p className={styles.cardSub}>Enter an existing room by ID</p>
            <form onSubmit={handleJoin} className={styles.form}>
              <input
                className={styles.input}
                type="number"
                placeholder="Room ID (e.g. 1)"
                value={roomId}
                onChange={(e) => { setJoinError(""); setRoomId(e.target.value); }}
              />
              {joinError && <p className={styles.error}>{joinError}</p>}
              <button className={`${styles.button} ${styles.buttonOutline}`} type="submit">
                Join Room →
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
