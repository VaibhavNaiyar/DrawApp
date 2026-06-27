import { auth } from "@/auth";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

/**
 * GET /api/ws-token
 *
 * Returns a short-lived JWT signed with AUTH_SECRET that the browser can pass
 * as ?token= in the draw-ws WebSocket URL.  This is necessary because the WS
 * handshake cannot carry HTTP-only cookies, and we never want to expose
 * AUTH_SECRET client-side.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Same claims format the draw-ws server expects (decoded.sub and decoded.name)
  const token = jwt.sign(
    {
      sub: session.user.id,
      name: session.user.name ?? "Anonymous",
    },
    secret,
    { expiresIn: "2m" } // short window — only needed for the initial WS handshake
  );

  return NextResponse.json({ token });
}
