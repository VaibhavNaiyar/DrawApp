import { WebSocketMessage } from "@repo/common";
import { ConnectedUser } from "./types";

// Every active WebSocket connection, keyed by its unique connectionId
export const connections = new Map<string, ConnectedUser>();

// Per-room: which connectionIds are currently in this room
export const roomConnections = new Map<string, Set<string>>();

// Per-room: all shapes drawn so far (loaded from DB on first join, kept in
// memory while at least one user is in the room)
export const roomShapes = new Map<string, WebSocketMessage[]>();
