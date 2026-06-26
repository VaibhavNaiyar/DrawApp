import { WebSocket } from "ws";
import { WsDataType, WebSocketMessage } from "@repo/common";
import { prismaClient } from "@repo/db";
import { ConnectedUser } from "../types";
import { roomConnections, roomShapes } from "../state";
import { send, broadcast, stampMessage } from "../utils/broadcast";
import { getParticipants } from "../utils/participants";

export async function onJoin(
  ws: WebSocket,
  msg: WebSocketMessage,
  user: ConnectedUser
) {
  const { roomId } = msg;
  const { connectionId, userId, userName } = user;
  const stamped = (overrides: Partial<WebSocketMessage> = {}) =>
    stampMessage(msg, connectionId, userId, userName, overrides);

  // Validate room exists in DB
  const room = await prismaClient.room.findUnique({ where: { id: roomId } });
  if (!room) {
    send(ws, stamped({ type: WsDataType.LEAVE, message: "Room not found" }));
    return;
  }

  // Register in room
  user.rooms.add(roomId);
  if (!roomConnections.has(roomId)) roomConnections.set(roomId, new Set());
  roomConnections.get(roomId)!.add(connectionId);

  // Load shapes from DB if this is the first user in the room
  if (!roomShapes.has(roomId)) {
    const dbShapes = await prismaClient.shape.findMany({
      where: { roomId },
      orderBy: { createdAt: "asc" },
    });
    roomShapes.set(
      roomId,
      dbShapes.map((s: { message: string }) => JSON.parse(s.message) as WebSocketMessage)
    );
  }

  const participants = getParticipants(roomId);

  // Send existing shapes to the joining user only
  send(ws, stamped({
    type: WsDataType.EXISTING_SHAPES,
    message: JSON.stringify(roomShapes.get(roomId) ?? []),
    participants,
  }));

  // Send current participant list to the joining user only
  send(ws, stamped({
    type: WsDataType.EXISTING_PARTICIPANTS,
    message: null,
    participants,
  }));

  // Tell everyone else a new user joined (update their participant list)
  broadcast(roomId, stamped({
    type: WsDataType.USER_JOINED,
    message: null,
    participants: getParticipants(roomId),
  }), connectionId);

  console.log(`[draw-ws] ${userName} joined room ${roomId}  participants=${participants.length}`);
}
