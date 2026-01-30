import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().default("8080").transform(Number),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ");
    throw new Error(`Invalid environment configuration: ${errors}`);
  }

  return result.data;
}

export const config = loadConfig();

export type Config = typeof config;
