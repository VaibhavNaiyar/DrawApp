import { WebSocketMessage } from "@repo/common";
import { prismaClient } from "@repo/db";
import { ConnectedUser } from "../types";
import { roomShapes } from "../state";
import { broadcast, stampMessage } from "../utils/broadcast";

/**
 * Delete one or more shapes.
 * msg.message = JSON array of shape IDs to remove, e.g. '["id1","id2"]'
 * Shapes are removed from memory and DB, then the eraser event is broadcast.
 */
export async function onEraser(msg: WebSocketMessage, user: ConnectedUser) {
  const { roomId } = msg;
  const { connectionId, userId, userName } = user;

  if (!user.rooms.has(roomId)) return;

  let idsToRemove: string[] = [];
  try {
    idsToRemove = JSON.parse(msg.message ?? "[]") as string[];
  } catch {
    return;
  }

  // Remove from memory — keep shapes whose id is null (can't be targeted)
  // or whose id is not in the removal list
  const current = roomShapes.get(roomId) ?? [];
  roomShapes.set(
    roomId,
    current.filter((s) => !s.id || !idsToRemove.includes(s.id))
  );

  // Remove from DB
  await prismaClient.shape.deleteMany({
    where: { id: { in: idsToRemove }, roomId },
  });

  broadcast(roomId, stampMessage(msg, connectionId, userId, userName), connectionId);
}
