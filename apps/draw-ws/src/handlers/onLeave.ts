import { WsDataType } from "@repo/common";
import { ConnectedUser } from "../types";
import { roomConnections, roomShapes } from "../state";
import { broadcast } from "../utils/broadcast";
import { getParticipants } from "../utils/participants";

/**
 * Remove a connection from a room, update in-memory state, and broadcast
 * USER_LEFT to remaining participants.
 * When the room becomes empty its shape cache is cleared (shapes are safe
 * in the DB and will be reloaded on next join).
 */
export function leaveRoom(user: ConnectedUser, roomId: string) {
  user.rooms.delete(roomId);

  const connIds = roomConnections.get(roomId);
  if (connIds) {
    connIds.delete(user.connectionId);

    if (connIds.size === 0) {
      roomConnections.delete(roomId);
      roomShapes.delete(roomId); // free memory; DB is the source of truth
    }
  }

  broadcast(roomId, {
    id: null,
    type: WsDataType.USER_LEFT,
    connectionId: user.connectionId,
    roomId,
    userId: user.userId,
    userName: user.userName,
    message: null,
    participants: getParticipants(roomId),
    timestamp: new Date().toISOString(),
  });

  console.log(`[draw-ws] ${user.userName} left room ${roomId}`);
}

/** Explicit LEAVE message from client. */
export function onLeave(user: ConnectedUser, roomId: string) {
  leaveRoom(user, roomId);
}
