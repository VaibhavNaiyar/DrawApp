import { RoomParticipants } from "@repo/common";
import { connections, roomConnections } from "../state";

/**
 * Build the current participant list for a room.
 * Deduplicates by userId so a user with 3 tabs counts as 1 participant.
 */
export function getParticipants(roomId: string): RoomParticipants[] {
  const connIds = roomConnections.get(roomId) ?? new Set<string>();
  const seen = new Set<string>();
  const list: RoomParticipants[] = [];

  for (const connId of connIds) {
    const user = connections.get(connId);
    if (user && !seen.has(user.userId)) {
      seen.add(user.userId);
      list.push({ userId: user.userId, userName: user.userName });
    }
  }

  return list;
}
