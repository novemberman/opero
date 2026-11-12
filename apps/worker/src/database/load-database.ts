import type { createPrismaClient, PrismaClient } from "@opero/database";

type DatabaseModule = {
  createPrismaClient: typeof createPrismaClient;
  PrismaClient: typeof PrismaClient;
};

/**
 * Prisma 7 ships ESM. Nest emits CommonJS, so static imports become require() and fail.
 * Load the package through a true dynamic import() instead.
 */
export async function loadDatabaseModule(): Promise<DatabaseModule> {
  const dynamicImport = new Function(
    "specifier",
    "return import(specifier)",
  ) as (specifier: string) => Promise<DatabaseModule>;
  return dynamicImport("@opero/database");
}
