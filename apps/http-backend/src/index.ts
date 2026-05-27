import express from "express";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { middleware } from "./middlewares";
import { SignupSchema, SigninSchema } from "@repo/common";
import { JWT_SECRET } from "@repo/backend-common";
import { prismaClient } from "@repo/db";

dotenv.config();

const app = express();
app.use(express.json());

// ─── Routes ──────────────────────────────────────────────────────────────────

app.post("/signup", async (req, res) => {
  const parsedData = SignupSchema.safeParse(req.body);

  if (!parsedData.success) {
    res.status(400).json({
      message: "Validation failed",
      errors: parsedData.error.errors,
    });
    return;
  }

  const { username, password, email } = parsedData.data;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prismaClient.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        name: username,
      },
    });

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET);

    res.json({ token });
  } catch (e: any) {
    if (e?.code === "P2002") {
      res.status(409).json({ message: "Username or email already exists" });
      return;
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/signin", async (req, res) => {
  const parsedData = SigninSchema.safeParse(req.body);

  if (!parsedData.success) {
    res.status(400).json({
      message: "Validation failed",
      errors: parsedData.error.errors,
    });
    return;
  }

  const { username, password } = parsedData.data;

  try {
    const user = await prismaClient.user.findUnique({ where: { username } });

    if (!user) {
      res.status(403).json({ message: "User not found" });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      res.status(403).json({ message: "Wrong password" });
      return;
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET);

    res.json({ token });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/room", middleware, (req, res) => {
  res.json({ userId: req.userId });
});

// ─── Start Server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`HTTP server running on port ${PORT}`);
});
