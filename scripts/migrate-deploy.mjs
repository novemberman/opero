#!/usr/bin/env node
/**
 * Safe Prisma migrate deploy for staging/production.
 *
 * - PostgreSQL advisory lock prevents simultaneous migrators
 * - Runs prisma migrate deploy then migrate status
 * - Never runs migrate reset / db push
 *
 * Usage (from repo root): node scripts/migrate-deploy.mjs
 * Requires: DATABASE_URL
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOCK_KEY = 7_424_201_131;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databasePkg = resolve(root, "packages/database");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required for migrate-deploy");
  process.exit(1);
}
if (process.env.ALLOW_MIGRATE_RESET === "true") {
  console.error("ALLOW_MIGRATE_RESET is forbidden; refusing to continue");
  process.exit(1);
}

const require = createRequire(resolve(databasePkg, "package.json"));
const { default: pg } = await import(require.resolve("pg"));

function runNode(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: databasePkg,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`command exited ${code}: ${args.join(" ")}`));
    });
  });
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const locked = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
if (!locked.rows[0]?.ok) {
  console.error("Another migrator holds the advisory lock; aborting");
  await client.end();
  process.exit(2);
}

try {
  console.log("Acquired migration advisory lock");
  const prismaCli = require.resolve("prisma/build/index.js");
  await runNode([prismaCli, "migrate", "deploy"]);
  await runNode([prismaCli, "migrate", "status"]);
  console.log("Migration deploy completed successfully");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
  await client.end().catch(() => undefined);
}
