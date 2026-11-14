import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

loadEnv({ path: resolve(import.meta.dirname, "../../.env") });

/**
 * Do not use `env("DATABASE_URL")` here.
 *
 * Prisma loads this config for every CLI command, including `prisma generate`.
 * The `env()` helper throws when the variable is unset, which breaks Docker/CI
 * builds that only need client generation and must not embed real credentials.
 *
 * Reading `process.env.DATABASE_URL` keeps generate working without a URL.
 * Commands that connect (`migrate`, `db *`) still require a real DATABASE_URL;
 * migrate-deploy.mjs and app runtime env parsers enforce that separately.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
