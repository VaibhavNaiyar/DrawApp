import { WebSocket } from "ws";
import { RawData } from "ws";
import { IncomingMessage } from "http";
import jwt, { JwtPayload } from "jsonwebtoken";
import { randomUUID } from "crypto";
import { AUTH_SECRET } from "@repo/backend-common";
import { WsDataType, WebSocketMessage } from "@repo/common";
import { ConnectedUser } from "./types";
import { connections } from "./state";
import { send } from "./utils/broadcast";
import { onJoin } from "./handlers/onJoin";
import { onDraw } from "./handlers/onDraw";
import { onEraser } from "./handlers/onEraser";
import { onUpdate } from "./handlers/onUpdate";
import { onBroadcastOnly } from "./handlers/onBroadcastOnly";
import { onLeave, leaveRoom } from "./handlers/onLeave";
import { onCloseRoom } from "./handlers/onCloseRoom";

export function handleConnection(ws: WebSocket, request: IncomingMessage) {
  // ── 1. Authenticate ────────────────────────────────────────────────────────
  const rawUrl = request.url ?? "";
  const token = new URLSearchParams(rawUrl.split("?")[1] ?? "").get("token");

  if (!token) {
    ws.close(4001, "Missing token");
    return;
  }

  let userId: string;
  let userName: string;

  try {
    const decoded = jwt.verify(token, AUTH_SECRET) as JwtPayload;
    // Support both our custom JWT ({ userId }) and NextAuth JWT ({ sub })
    userId = (decoded.userId ?? decoded.sub) as string;
    userName = (decoded.name ?? "Anonymous") as string;
    if (!userId) throw new Error("No user id in token");
  } catch {
    ws.close(4001, "Invalid token");
    return;
  }

  // ── 2. Register connection ─────────────────────────────────────────────────
  const connectionId = randomUUID();
  const user: ConnectedUser = {
    userId,
    userName,
    connectionId,
    ws,
    rooms: new Set(),
  };
  connections.set(connectionId, user);

  console.log(
    `[draw-ws] Connected  user=${userName}  conn=${connectionId}  total=${connections.size}`
  );

  // ── 3. Acknowledge the connection with the assigned connectionId ───────────
  // The client needs this ID to ignore its own CURSOR_MOVE echoes and to
  // handle multi-tab deduplication.
  send(ws, {
    id: null,
    type: WsDataType.CONNECTION_READY,
    connectionId,
    roomId: "",
    userId,
    userName,
    message: null,
    participants: null,
    timestamp: new Date().toISOString(),
  });

  // ── 4. Message handler ─────────────────────────────────────────────────────
  ws.on("message", async (data: RawData) => {
    let msg: WebSocketMessage;
    try {
      msg = JSON.parse(data.toString()) as WebSocketMessage;
    } catch {
      return; // silently drop malformed JSON
    }

    const { type } = msg;

    switch (type) {
      case WsDataType.JOIN:          await onJoin(ws, msg, user);    break;
      case WsDataType.DRAW:          await onDraw(msg, user);         break;
      case WsDataType.STREAM_SHAPE:  onBroadcastOnly(msg, user);      break;
      case WsDataType.ERASER:        await onEraser(msg, user);       break;
      case WsDataType.UPDATE:        await onUpdate(msg, user);       break;
      case WsDataType.STREAM_UPDATE: onBroadcastOnly(msg, user);      break;
      case WsDataType.CURSOR_MOVE:   onBroadcastOnly(msg, user);      break;
      case WsDataType.LEAVE:         onLeave(user, msg.roomId);       break;
      case WsDataType.CLOSE_ROOM:    await onCloseRoom(msg, user);    break;
      default:                       break;
    }
  });

  // ── 5. Disconnect handler ──────────────────────────────────────────────────
  ws.on("close", () => {
    for (const roomId of Array.from(user.rooms)) {
      leaveRoom(user, roomId);
    }
    connections.delete(connectionId);
    console.log(
      `[draw-ws] Disconnected user=${userName}  conn=${connectionId}  total=${connections.size}`
    );
  });

  ws.on("error", (err) => {
    console.error(`[draw-ws] Socket error for ${userName}:`, err.message);
  });
}
