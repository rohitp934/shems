import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DB_HOST: z.string(),
    DB_PORT: z.string().transform((s) => parseInt(s, 10)),
    DATABASE: z.string(),
    POSTGRES_USER: z.string(),
    POSTGRES_PASSWORD: z.string(),
    NODE_ENV: z.union([z.literal("dev"), z.literal("production")]),
    GITHUB_CLIENT_ID: z.string(),
    GITHUB_CLIENT_SECRET: z.string(),
    CLIENT_URL: z.string().default("http://localhost:8080"),
  },
  runtimeEnv: process.env,
});
