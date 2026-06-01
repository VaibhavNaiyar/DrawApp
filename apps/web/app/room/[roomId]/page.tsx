"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import styles from "./room.module.css";

interface ChatMessage {
  id: number;
  message: string;
  userId: string;
  roomId: number;
  createdAt: string;
  user?: { username: string };
}

function decodeToken(token: string): string {
  try {
    return JSON.parse(atob(token.split(".")[1])).userId ?? "";
  } catch {
    return "";
  }
}

function addUnique(prev: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  if (prev.some((m) => m.id === msg.id)) return prev;
  return [...prev, msg];
}

export default function RoomPage() {
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const params = useParams();
  const roomId = Number(params.roomId);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/signin");
      return;
    }

    setCurrentUserId(decodeToken(token));

    const ws = new WebSocket(`ws://localhost:8080?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "join_room", roomId }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "old_chats") {
        // Replace state entirely — server sends full history on join
        setChats(data.chats as ChatMessage[]);
      } else if (data.type === "chat") {
        setChats((prev) => addUnique(prev, data.message));
      } else if (data.error) {
        setError(data.error);
      }
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setError("WebSocket connection failed");

    return () => {
      // Close regardless of state (CONNECTING or OPEN) to prevent double-connect in StrictMode
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "leave_room", roomId }));
      }
      ws.close();
    };
  }, [roomId, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats]);

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: "chat", roomId, message: msg }));
    setInput("");
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.back} onClick={() => router.push("/dashboard")}>
          ←
        </button>
        <div className={styles.headerInfo}>
          <span className={styles.roomTitle}>Room #{roomId}</span>
          <span className={styles.roomStatus}>
            {connected ? "● Online" : "○ Offline"}
          </span>
        </div>
        <span className={`${styles.statusBadge} ${connected ? styles.online : styles.offline}`}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </header>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.messages}>
        {chats.length === 0 && (
          <p className={styles.empty}>No messages yet. Say hello!</p>
        )}
        {chats.map((chat) => {
          const isOwn = chat.userId === currentUserId;
          return (
            <div key={chat.id} className={`${styles.messageRow} ${isOwn ? styles.own : ""}`}>
              <div className={styles.bubble}>
                {!isOwn && (
                  <span className={styles.bubbleUser}>
                    {chat.user?.username ?? chat.userId.slice(0, 8)}
                  </span>
                )}
                <span className={styles.bubbleText}>{chat.message}</span>
                <span className={styles.bubbleTime}>
                  {new Date(chat.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={sendMessage} className={styles.inputArea}>
        <input
          className={styles.input}
          type="text"
          placeholder={connected ? "Type a message..." : "Connecting..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!connected}
        />
        <button className={styles.send} type="submit" disabled={!connected || !input.trim()}>
          ➤
        </button>
      </form>
    </div>
  );
}
