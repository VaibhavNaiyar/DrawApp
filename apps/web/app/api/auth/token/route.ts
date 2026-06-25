import { NextResponse } from "next/server";
import { auth } from "@/auth";
import jwt from "jsonwebtoken";

// Issues a short-lived JWT for WebSocket authentication.
// The WebSocket server (ws-backend / draw-ws-backend) verifies this token
// using AUTH_SECRET and reads decoded.userId to identify the user.
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wsToken = jwt.sign(
    { userId: session.user.id, name: session.user.name },
    process.env.AUTH_SECRET!,
    { expiresIn: "1h" }
  );

  return NextResponse.json({ token: wsToken });
}
