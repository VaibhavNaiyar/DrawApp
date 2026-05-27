import { z } from "zod";

// ─── Auth Schemas ─────────────────────────────────────────────────────────────
// Shared by backend (request validation) AND frontend (form validation).
// One source of truth — change the rule here, it applies everywhere.

export const SignupSchema = z.object({
  username: z.string().min(3).max(20),
  password: z.string().min(6),
  email: z.string().email(),
});

export const SigninSchema = z.object({
  username: z.string(),
  password: z.string(),
});

// z.infer derives the TS type from the schema — no duplication
export type SignupInput = z.infer<typeof SignupSchema>;
export type SigninInput = z.infer<typeof SigninSchema>;
