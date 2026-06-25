import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

declare const globalThis: {
  prismaGlobal: PrismaClient | undefined;
} & typeof global;

const prismaClient = globalThis.prismaGlobal ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prismaClient;
}

export { prismaClient };
export default prismaClient;
