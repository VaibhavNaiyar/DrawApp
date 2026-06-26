import { WebSocketMessage } from "@repo/common";
import { ConnectedUser } from "../types";
import { broadcast, stampMessage } from "../utils/broadcast";

/**
 * Handles events that are never persisted — just forwarded to the rest of
 * the room in real-time: STREAM_SHAPE, STREAM_UPDATE, CURSOR_MOVE.
 */
export function onBroadcastOnly(msg: WebSocketMessage, user: ConnectedUser) {
  const { roomId } = msg;
  const { connectionId, userId, userName } = user;

  if (!user.rooms.has(roomId)) return;

  broadcast(roomId, stampMessage(msg, connectionId, userId, userName), connectionId);
}
