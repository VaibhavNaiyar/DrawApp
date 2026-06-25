import type { NextAuthConfig } from "next-auth";

// Edge-compatible config — no Node.js-only imports (no Prisma, no bcrypt).
// Used by middleware.ts which runs in the Edge runtime.
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isProtected =
        nextUrl.pathname.startsWith("/dashboard") ||
        nextUrl.pathname.startsWith("/room");

      if (isProtected) return isLoggedIn;
      return true;
    },
  },
  providers: [],
};
