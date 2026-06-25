import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

// __dirname at runtime = packages/backend-common/dist/
// Walking up: dist → backend-common → packages → workspace root
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const EnvSchema = z.object({
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET must be set in root .env"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Missing environment variables:");
  parsed.error.errors.forEach((e) => console.error(` - ${e.path}: ${e.message}`));
  process.exit(1);
}

export const AUTH_SECRET = parsed.data.AUTH_SECRET;

// Legacy alias — keeps the existing ws-backend (chat reference) working
// without modification. Both resolve to the same AUTH_SECRET value.
export const JWT_SECRET = parsed.data.AUTH_SECRET;
