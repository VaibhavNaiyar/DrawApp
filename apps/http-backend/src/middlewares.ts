import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AUTH_SECRET } from "@repo/backend-common";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function middleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized: No token provided" });
    return;
  }

  const token = authHeader.split(" ")[1]!;

  try {
    // Handles both NextAuth JWTs (sub field) and legacy JWTs (userId field)
    const decoded = jwt.verify(token, AUTH_SECRET) as { sub?: string; userId?: string };
    req.userId = decoded.sub ?? decoded.userId;
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
  }
}
