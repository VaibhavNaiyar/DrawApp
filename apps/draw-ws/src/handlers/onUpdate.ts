import { WebSocketMessage } from "@repo/common";
import { prismaClient } from "@repo/db";
import { ConnectedUser } from "../types";
import { roomShapes } from "../state";
import { broadcast, stampMessage } from "../utils/broadcast";

/**
 * A shape's properties changed (colour, stroke width, text content…).
 * Identified by msg.id. Persisted to DB and broadcast.
 */
export async function onUpdate(msg: WebSocketMessage, user: ConnectedUser) {
  const { roomId } = msg;
  const { connectionId, userId, userName } = user;

  if (!user.rooms.has(roomId) || !msg.id) return;

  const updated = stampMessage(msg, connectionId, userId, userName);

  // Update in memory
  const shapes = roomShapes.get(roomId) ?? [];
  const idx = shapes.findIndex((s) => s.id === msg.id);
  if (idx !== -1) shapes[idx] = updated;

  // Update in DB
  await prismaClient.shape.update({
    where: { id: msg.id },
    data: { message: JSON.stringify(updated) },
  });

  broadcast(roomId, updated, connectionId);
}
