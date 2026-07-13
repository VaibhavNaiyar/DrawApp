import { auth } from "@/auth";
import prismaClient from "@repo/db";
import { NextResponse } from "next/server";

/** PATCH /api/rooms/:id — rename a room */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json() as { name?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Only the admin can rename their room
  const room = await prismaClient.room.findFirst({
    where: { id, adminId: session.user.id },
  });
  if (!room) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prismaClient.room.update({
    where: { id },
    data: { name },
    select: { id: true, name: true },
  });

  return NextResponse.json(updated);
}

/** DELETE /api/rooms/:id — delete a room and all its shapes */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const room = await prismaClient.room.findFirst({
    where: { id, adminId: session.user.id },
  });
  if (!room) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete shapes first (FK constraint), then the room
  await prismaClient.shape.deleteMany({ where: { roomId: id } });
  await prismaClient.room.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
