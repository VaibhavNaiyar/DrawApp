import express from "express";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { middleware } from "./middlewares";

// Loads the .env file and puts all variables into process.env
// Must be called before anything that reads process.env
dotenv.config();

const app = express();

// Tells Express to automatically parse incoming JSON request bodies
// Without this, req.body would be undefined
app.use(express.json());

// ─── Zod Schemas ────────────────────────────────────────────────────────────
// Zod is a schema validation library. You define the shape and rules of
// expected data, then call .safeParse() to validate against it.

const SignupSchema = z.object({
  username: z.string().min(3).max(20),  // string, at least 3 chars, max 20
  password: z.string().min(6),           // string, at least 6 chars
  email: z.string().email(),             // must be a valid email format
});

const SigninSchema = z.object({
  username: z.string(),
  password: z.string(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

app.post("/signup", (req, res) => {
  // safeParse returns { success: true, data: ... } or { success: false, error: ... }
  // It does NOT throw — so you check .success yourself
  const parsedData = SignupSchema.safeParse(req.body);

  if (!parsedData.success) {
    // parsedData.error.errors gives an array of what exactly failed
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

  // jwt.sign(payload, secret) creates a signed token
  // The payload is the data you want to embed inside the token
  // Anyone with the secret can verify it wasn't tampered with
  const token = jwt.sign(
    { userId: "dummyUserId", username },
    process.env.JWT_SECRET as string
  );

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

  const token = jwt.sign(
    { userId: "dummyUserId", username },
    process.env.JWT_SECRET as string
  );

  res.json({ token });
});

// The `middleware` argument between the path and the handler is the auth guard
// Express runs it first — if middleware calls next(), the handler runs
// If middleware sends a response (401), the handler never runs
app.get("/room", middleware, (req, res) => {
  // req.userId is available here because the middleware attached it
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
