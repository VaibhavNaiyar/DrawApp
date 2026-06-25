import { NextRequest, NextResponse } from "next/server";
import { SignupSchema } from "@repo/common";
import prismaClient from "@repo/db";
import bcrypt from "bcrypt";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Validation failed", errors: parsed.error.errors },
      { status: 400 }
    );
  }

  const { email, name, password } = parsed.data;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    await prismaClient.user.create({
      data: { email, name, password: hashedPassword },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ message: "Email already registered" }, { status: 409 });
    }
    console.error("[signup error]", e);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
