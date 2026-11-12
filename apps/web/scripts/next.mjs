import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(import.meta.dirname, "../../../.env"), quiet: true });

const mode = process.argv[2];
if (mode !== "dev" && mode !== "start") {
  console.error("Usage: node scripts/next.mjs <dev|start>");
  process.exit(1);
}

const host = process.env.WEB_HOST || "127.0.0.1";
const port = process.env.WEB_PORT || "3000";
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const childEnv = { ...process.env };

if (mode === "start") {
  childEnv.NODE_ENV = "production";
}

const child = spawn(process.execPath, [nextBin, mode, "--hostname", host, "--port", port], {
  stdio: "inherit",
  env: childEnv,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
