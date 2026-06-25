import { handlers } from "@/auth";

// NextAuth v5 — this catch-all handles all /api/auth/* routes:
// session, csrf, callback/credentials, signout, etc.
export const { GET, POST } = handlers;
