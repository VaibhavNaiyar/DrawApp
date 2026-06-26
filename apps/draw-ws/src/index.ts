import { WebSocketServer } from "ws";
import { handleConnection } from "./connection";

const PORT = Number(process.env.DRAW_WS_PORT) || 8081;
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", handleConnection);

console.log(`[draw-ws] Drawing WebSocket server running on port ${PORT}`);
