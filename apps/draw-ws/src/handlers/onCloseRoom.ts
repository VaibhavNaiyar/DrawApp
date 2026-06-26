import { WebSocketMessage } from "@repo/common";
import { prismaClient } from "@repo/db";
import { ConnectedUser } from "../types";
import { connections, roomConnections, roomShapes } from "../state";
import { broadcast, stampMessage } from "../utils/broadcast";

/**
 * Admin-only. Broadcasts CLOSE_ROOM to all participants, then evicts every
 * connection from the room and wipes the in-memory shape cache.
 * Shapes in the DB are NOT deleted — history is preserved.
 */
export async function onCloseRoom(msg: WebSocketMessage, user: ConnectedUser) {
  const { roomId } = msg;
  const { connectionId, userId, userName } = user;

  const room = await prismaClient.room.findUnique({ where: { id: roomId } });
  if (!room || room.adminId !== userId) return; // only admin can close

  // Broadcast first so clients can show a "room closed" message
  broadcast(roomId, stampMessage(msg, connectionId, userId, userName));

  // Evict all connections from the room
  const connIds = Array.from(roomConnections.get(roomId) ?? []);
  for (const connId of connIds) {
    const u = connections.get(connId);
    if (u) u.rooms.delete(roomId);
  }

  roomConnections.delete(roomId);
  roomShapes.delete(roomId);

  console.log(`[draw-ws] Room ${roomId} closed by ${userName}`);
}
