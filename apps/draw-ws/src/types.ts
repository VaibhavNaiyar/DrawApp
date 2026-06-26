import { WebSocket } from "ws";

export interface ConnectedUser {
  userId: string;
  userName: string;
  connectionId: string; // unique per browser tab — same user can have multiple
  ws: WebSocket;
  rooms: Set<string>; // cuid room IDs this connection is in
}
