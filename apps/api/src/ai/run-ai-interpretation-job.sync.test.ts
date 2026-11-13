import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Drops comments so only executable code and types are compared. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("in-process AI interpretation runner", () => {
  it("matches the worker implementation the integration tests stand in for", () => {
    const api = code(resolve(__dirname, "run-ai-interpretation-job.ts"));
    const worker = code(
      resolve(__dirname, "../../../worker/src/ai/execute-ai-interpretation.ts"),
    );
    expect(api).toBe(worker);
  });
});
