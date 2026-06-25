import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import dotenv from "dotenv";
import path from "path";

// __dirname = packages/db/src/ → walk up 3 levels to workspace root
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// Use WebSocket transport — works through firewalls (port 443 not 5432)
neonConfig.webSocketConstructor = ws;

declare const globalThis: {
  prismaGlobal: PrismaClient | undefined;
} & typeof global;

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaNeon(pool);
  return new PrismaClient({ adapter });
}

export const prismaClient = globalThis.prismaGlobal ?? createPrismaClient();

// Reuse the instance across hot-reloads in development
if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prismaClient;
}

export default prismaClient;
