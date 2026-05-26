import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// This tells TypeScript that Express's Request object
// can now carry an extra field called `userId`
// Without this, req.userId would give a TS error
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function middleware(req: Request, res: Response, next: NextFunction) {
  // The token is expected in the Authorization header like:
  // Authorization: Bearer <token>
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized: No token provided" });
    return;
  }

  // Split "Bearer <token>" → take index [1] which is the actual token
  const token = authHeader.split(" ")[1];

  try {
    // jwt.verify throws an error if the token is:
    // - expired, - tampered with, - signed with a different secret
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as { userId: string };

    // Attach userId to the request so route handlers can use it
    req.userId = decoded.userId;

    // Call next() to pass control to the actual route handler
    next();
  } catch (err) {
    res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
  }
}
