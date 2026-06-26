import { WebSocket } from "ws";
import { WebSocketMessage } from "@repo/common";
import { connections, roomConnections } from "../state";

/**
 * Send a WebSocketMessage to every connection in a room.
 * Pass excludeConnId to skip the sender (used for broadcasting).
 */
export function broadcast(
  roomId: string,
  message: WebSocketMessage,
  excludeConnId?: string
) {
  const payload = JSON.stringify(message);
  const connIds = roomConnections.get(roomId) ?? new Set<string>();

  for (const connId of connIds) {
    if (connId === excludeConnId) continue;
    const user = connections.get(connId);
    if (user?.ws.readyState === WebSocket.OPEN) {
      user.ws.send(payload);
    }
  }
}

/** Send a single message to one WebSocket (checks readyState first). */
export function send(ws: WebSocket, message: WebSocketMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Stamp a message with server-side connection metadata.
 * Merges connectionId, userId, userName, and a fresh timestamp into the base
 * message, then applies any extra overrides.
 */
export function stampMessage(
  base: WebSocketMessage,
  connectionId: string,
  userId: string,
  userName: string,
  overrides: Partial<WebSocketMessage> = {}
): WebSocketMessage {
  return {
    ...base,
    connectionId,
    userId,
    userName,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}
