import { WebSocketServer } from "ws";
import jwt, { JwtPayload } from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common";

const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", function connection(ws, request) {
  const url = request.url;
  if (!url) {
    ws.close();
    return;
  }

  const queryParams = new URLSearchParams(url.split("?")[1]);
  const token = queryParams.get("token");

  // token will be null if the client didn't send one
  if (!token) {
    ws.close();
    return;
  }

  // jwt.verify throws if the token is invalid or expired
  // wrapping in try/catch prevents the entire server from crashing
  // on a single bad connection attempt
  let userId: string;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    if (!decoded.userId) {
      ws.close();
      return;
    }

    userId = decoded.userId;
  } catch (e) {
    ws.close();
    return;
  }

  ws.on("message", function message(data) {
    ws.send("pong");
  });
});
