import { PrismaClient } from "./generated/prisma/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prismaOptions: any = process.env.DATABASE_URL
  ? {
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    }
  : {};

export const prismaClient = new PrismaClient(prismaOptions);
