import type { createPrismaClient, PrismaClient } from "@opero/database";

type DatabaseModule = {
  createPrismaClient: typeof createPrismaClient;
  PrismaClient: typeof PrismaClient;
};

/**
 * Prisma 7 ships ESM. Nest emits CommonJS, so a static/dynamic import would be
 * rewritten to require() and fail at runtime. Vitest can load ESM natively.
 */
export async function loadDatabaseModule(): Promise<DatabaseModule> {
  if (process.env.VITEST) {
    return import("@opero/database") as Promise<DatabaseModule>;
  }

  const dynamicImport = new Function(
    "specifier",
    "return import(specifier)",
  ) as (specifier: string) => Promise<DatabaseModule>;
  return dynamicImport("@opero/database");
}
