import { auth } from "@/auth";
import prismaClient from "@repo/db";
import { NextResponse } from "next/server";

/**
 * GET /api/rooms
 *
 * Returns the 10 most recently updated rooms created by the authenticated user.
 * Used by the dashboard to show "My Rooms".
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rooms = await prismaClient.room.findMany({
    where: { adminId: session.user.id },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: { id: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({ rooms });
}
