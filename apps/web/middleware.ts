import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Use the edge-compatible config (no Prisma/bcrypt) for middleware.
// NextAuth verifies the JWT cookie and redirects unauthenticated users to /signin.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: ["/dashboard/:path*", "/room/:path*"],
};
