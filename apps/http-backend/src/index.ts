import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { middleware } from "./middlewares";
import { SignupSchema, SigninSchema } from "@repo/common";
import { AUTH_SECRET } from "@repo/backend-common";
import { prismaClient } from "@repo/db";

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000" }));
app.use(express.json());

// ─── Auth Routes ──────────────────────────────────────────────────────────────
// These are kept as standalone REST endpoints for reference / direct API use.
// The web app authenticates via NextAuth (see apps/web/auth.ts).

app.post("/signup", async (req, res) => {
  const parsedData = SignupSchema.safeParse(req.body);

  if (!parsedData.success) {
    res.status(400).json({ message: "Validation failed", errors: parsedData.error.errors });
    return;
  }

  const { email, name, password } = parsedData.data;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prismaClient.user.create({
      data: { email, name, password: hashedPassword },
    });

    const token = jwt.sign({ userId: user.id, name: user.name }, AUTH_SECRET, {
      expiresIn: "7d",
    });

    res.json({ token });
  } catch (e: any) {
    console.error("[signup error]", e);
    if (e?.code === "P2002") {
      res.status(409).json({ message: "Email already registered" });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/signin", async (req, res) => {
  const parsedData = SigninSchema.safeParse(req.body);

  if (!parsedData.success) {
    res.status(400).json({ message: "Validation failed", errors: parsedData.error.errors });
    return;
  }

  const { email, password } = parsedData.data;

  try {
    const user = await prismaClient.user.findUnique({ where: { email } });

    if (!user) {
      res.status(403).json({ message: "User not found" });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      res.status(403).json({ message: "Wrong password" });
      return;
    }

    const token = jwt.sign({ userId: user.id, name: user.name }, AUTH_SECRET, {
      expiresIn: "7d",
    });

    res.json({ token });
  } catch (e) {
    console.error("[signin error]", e);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ─── Room Routes ──────────────────────────────────────────────────────────────

app.post("/room", middleware, async (req, res) => {
  try {
    // Count existing rooms to auto-generate "Drawing N"
    const count = await prismaClient.room.count({ where: { adminId: req.userId! } });
    const name = `Drawing ${count + 1}`;
    const room = await prismaClient.room.create({
      data: { adminId: req.userId!, name },
    });
    res.json({ roomId: room.id, name: room.name });
  } catch (e: any) {
    console.error("[create room error]", e);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/room/:id", middleware, async (req, res) => {
  const { id } = req.params;
  try {
    const room = await prismaClient.room.findUnique({ where: { id } });
    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }
    res.json({ roomId: room.id });
  } catch (e) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// ─── Server ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`HTTP server running on port ${PORT}`);
});
