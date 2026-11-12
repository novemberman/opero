import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

/**
 * Resolve DOCUMENT_STORAGE_ROOT so API and worker share the same filesystem tree.
 * Relative paths are anchored at the monorepo root (pnpm-workspace.yaml), not process.cwd().
 */
export function resolveStorageRoot(configuredRoot: string): string {
  if (isAbsolute(configuredRoot)) {
    return configuredRoot;
  }

  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
      return resolve(dir, configuredRoot);
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return resolve(process.cwd(), configuredRoot);
}
