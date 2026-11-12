import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
await mkdir(dist, { recursive: true });

// Prisma 7 generates TypeScript client sources. Nest apps load this package via
// `node --import tsx`, which can resolve the generated .ts entrypoints.
const indexJs = `import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

export function createPrismaClient(connectionString) {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export { PrismaClient };
export * from "../generated/prisma/client.ts";
`;

const indexDts = `export { createPrismaClient, PrismaClient } from "../src/client";
export * from "../generated/prisma/client";
`;

await writeFile(join(dist, "index.js"), indexJs, "utf8");
await writeFile(join(dist, "index.d.ts"), indexDts, "utf8");
