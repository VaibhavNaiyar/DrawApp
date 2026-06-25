import { WebSocketServer, WebSocket } from "ws";
import jwt, { JwtPayload } from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common";
import { prismaClient } from "@repo/db";

const wss = new WebSocketServer({ port: 8080 });

//  In-memory store 

interface User {
  userId: string;
  ws: WebSocket;
  rooms: number[];
}

// All currently connected users
const users: User[] = [];

//  Helpers 

function getUser(ws: WebSocket): User | undefined {
  return users.find((u) => u.ws === ws);
}

function broadcastToRoom(roomId: number, message: object, senderWs: WebSocket) {
  const payload = JSON.stringify(message);
  users.forEach((u) => {
    if (u.rooms.includes(roomId) && u.ws !== senderWs && u.ws.readyState === WebSocket.OPEN) {
      u.ws.send(payload);
    }
  });
}

//  Connection 

wss.on("connection", function connection(ws, request) {
  // 1. Extract token from query param: ws://localhost:8080?token=xxx
  const url = request.url;
  if (!url) { ws.close(); return; }

  const token = new URLSearchParams(url.split("?")[1]).get("token");
  if (!token) { ws.close(); return; }

  // 2. Verify JWT
  let userId: string;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (!decoded.userId) { ws.close(); return; }
    userId = decoded.userId;
  } catch {
    ws.close();
    return;
  }

  // 3. Register this connection in the users array
  const user: User = { userId, ws, rooms: [] };
  users.push(user);

  console.log(`User ${userId} connected. Total online: ${users.length}`);

  //  Message Handler

  ws.on("message", async function message(data) {
    let parsed: any;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    const { type, roomId, message: chatMessage } = parsed;
    const currentUser = getUser(ws);
    if (!currentUser) return;

    // ── JOIN ROOM ─────────────────────────────────────────────────────────
    if (type === "join_room") {
      // Check the room actually exists in the DB
      const room = await prismaClient.room.findUnique({ where: { id: roomId } });
      if (!room) {
        ws.send(JSON.stringify({ error: "Room not found" }));
        return;
      }

      // Add user to this room in memory
      currentUser.rooms.push(roomId);

      // Fetch last 50 messages from DB and send to the joining user
      const oldChats = await prismaClient.chat.findMany({
        where: { roomId },
        orderBy: { createdAt: "asc" },
        take: 50,
        include: { user: { select: { username: true } } },
      });

      ws.send(JSON.stringify({ type: "old_chats", chats: oldChats }));
      console.log(`User ${userId} joined room ${roomId}`);
    }

    //  LEAVE ROOM 
    else if (type === "leave_room") {
      currentUser.rooms = currentUser.rooms.filter((r) => r !== roomId);
      console.log(`User ${userId} left room ${roomId}`);
    }

    //  CHAT 
    else if (type === "chat") {
      // User must be in the room to chat
      if (!currentUser.rooms.includes(roomId)) {
        ws.send(JSON.stringify({ error: "You are not in this room" }));
        return;
      }

      // Save message to DB
      const saved = await prismaClient.chat.create({
        data: {
          message: chatMessage,
          userId: currentUser.userId,
          roomId,
        },
        include: { user: { select: { username: true } } },
      });

      // Send back to sender so they see their own message
      ws.send(JSON.stringify({ type: "chat", message: saved }));
      // Broadcast to everyone else in the room
      broadcastToRoom(roomId, { type: "chat", message: saved }, currentUser.ws);
    }
  });

  //  Disconnect 

  ws.on("close", function () {
    const index = users.findIndex((u) => u.ws === ws);
    if (index !== -1) users.splice(index, 1);
    console.log(`User ${userId} disconnected. Total online: ${users.length}`);
  });
});

console.log("WebSocket server running on port 8080");
