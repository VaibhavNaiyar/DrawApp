import express from "express";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { middleware } from "./middlewares";
import { SignupSchema, SigninSchema } from "@repo/common";
import { JWT_SECRET } from "@repo/backend-common";

// Loads this app's own .env (PORT=3001)
// JWT_SECRET is loaded by @repo/backend-common from the root .env
dotenv.config();

const app = express();
app.use(express.json());

// ─── Routes ──────────────────────────────────────────────────────────────────

app.post("/signup", (req, res) => {
  const parsedData = SignupSchema.safeParse(req.body);

  if (!parsedData.success) {
    res.status(400).json({
      message: "Validation failed",
      errors: parsedData.error.errors,
    });
    return;
  }

  const { username, password, email } = parsedData.data;

  // db signup
  // const hashedPassword = await bcrypt.hash(password, 10);
  // const user = await db.user.create({ data: { username, password: hashedPassword, email } });

  const token = jwt.sign({ userId: "dummyUserId", username }, JWT_SECRET);

  res.json({ token });
});

app.post("/signin", (req, res) => {
  const parsedData = SigninSchema.safeParse(req.body);

  if (!parsedData.success) {
    res.status(400).json({
      message: "Validation failed",
      errors: parsedData.error.errors,
    });
    return;
  }

  const { username, password } = parsedData.data;

  // db signin
  // const user = await db.user.findUnique({ where: { username } });
  // if (!user) { res.status(403).json({ message: "User not found" }); return; }
  // const passwordMatch = await bcrypt.compare(password, user.password);
  // if (!passwordMatch) { res.status(403).json({ message: "Wrong password" }); return; }

  const token = jwt.sign({ userId: "dummyUserId", username }, JWT_SECRET);

  res.json({ token });
});

app.get("/room", middleware, (req, res) => {
  const userId = req.userId;

  // db get rooms for this user
  // const rooms = await db.room.findMany({ where: { creatorId: userId } });

  res.json({ message: "You are authenticated", userId });
});

// ─── Start Server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`HTTP server running on port ${PORT}`);
});
