import { randomUUID } from "crypto";
import { WebSocketMessage } from "@repo/common";
import { prismaClient } from "@repo/db";
import { ConnectedUser } from "../types";
import { roomShapes } from "../state";
import { broadcast, stampMessage } from "../utils/broadcast";

/**
 * A completed shape (mouse-up / touch-end).
 * Persisted to DB and broadcast to the rest of the room.
 */
export async function onDraw(msg: WebSocketMessage, user: ConnectedUser) {
  const { roomId } = msg;
  const { connectionId, userId, userName } = user;

  if (!user.rooms.has(roomId)) return;

  const shapeId = msg.id ?? randomUUID();
  const shape = stampMessage(msg, connectionId, userId, userName, { id: shapeId });

  // Store in memory
  const shapes = roomShapes.get(roomId) ?? [];
  shapes.push(shape);
  roomShapes.set(roomId, shapes);

  // Persist to DB
  await prismaClient.shape.create({
    data: {
      id: shapeId,
      message: JSON.stringify(shape),
      userId,
      roomId,
    },
  });

  // Broadcast to everyone else (sender already rendered it locally)
  broadcast(roomId, shape, connectionId);
}
