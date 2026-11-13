import type { ConfigService } from "@nestjs/config";
import type { PrismaClient } from "@opero/database";
import type { AiInterpretJobPayload } from "@opero/shared";
import type { Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerEnv } from "../config/env";
import { AI_INTERPRET_JOB } from "./ai.constants";
import { AiInterpretProcessor } from "./ai-interpret.processor";
import { executeAiInterpretation } from "./execute-ai-interpretation";

vi.mock("./execute-ai-interpretation", () => ({
  executeAiInterpretation: vi.fn(async () => "SUCCEEDED"),
}));

const execute = vi.mocked(executeAiInterpretation);

const payload: AiInterpretJobPayload = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  aiInterpretationRunId: "33333333-3333-4333-8333-333333333333",
  actorUserId: "44444444-4444-4444-8444-444444444444",
};

const env: Partial<WorkerEnv> = {
  AI_SHARE_STRUCTURED_CONTEXT: true,
  AI_PROVIDER: "mock",
  AI_TIMEOUT_MS: 30_000,
};

function processor() {
  // Any database access from the processor itself would throw.
  const prisma = new Proxy({}, { get: () => { throw new Error("unexpected database access"); } });
  const config = { get: (key: keyof WorkerEnv) => env[key] } as unknown as ConfigService<WorkerEnv, true>;
  return new AiInterpretProcessor(prisma as PrismaClient, config);
}

function jobOf(
  data: unknown,
  options: { name?: string; attemptsMade?: number; attempts?: number } = {},
): Job<AiInterpretJobPayload> {
  return {
    name: options.name ?? AI_INTERPRET_JOB,
    data,
    attemptsMade: options.attemptsMade ?? 0,
    opts: options.attempts === undefined ? {} : { attempts: options.attempts },
  } as unknown as Job<AiInterpretJobPayload>;
}

describe("AiInterpretProcessor", () => {
  beforeEach(() => execute.mockClear());

  it("ignores jobs it does not own", async () => {
    await processor().process(jobOf(payload, { name: "something.else" }));

    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ["no payload", undefined],
    ["no organization", { ...payload, organizationId: undefined }],
    ["an empty organization", { ...payload, organizationId: "" }],
    ["no actor", { ...payload, actorUserId: undefined }],
  ])("rejects a job with %s before doing any work", async (_label, data) => {
    await expect(processor().process(jobOf(data))).rejects.toThrow(/tenant context/);

    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a job without a run id or with malformed notes", async () => {
    await expect(
      processor().process(jobOf({ ...payload, aiInterpretationRunId: "" })),
    ).rejects.toThrow(/aiInterpretationRunId/);
    await expect(
      processor().process(jobOf({ ...payload, userNotes: { text: "x" } })),
    ).rejects.toThrow(/userNotes/);

    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    [0, 3, false],
    [1, 3, false],
    [2, 3, true],
    [0, 1, true],
    [0, undefined, true],
    [5, 3, true],
  ])(
    "with %i attempts made of %s allowed, final attempt is %s",
    async (attemptsMade, attempts, finalAttempt) => {
      await processor().process(jobOf(payload, { attemptsMade, attempts }));

      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute.mock.calls[0]![3]).toEqual({ finalAttempt });
    },
  );

  it("passes the tenant payload and the configured provider settings through", async () => {
    await processor().process(jobOf(payload, { attempts: 2 }));

    const [, settings, job] = execute.mock.calls[0]!;
    expect(job).toEqual(payload);
    expect(settings).toEqual({
      shareStructuredContext: true,
      providerEnv: {
        AI_PROVIDER: "mock",
        OPENAI_API_KEY: undefined,
        OPENAI_MODEL: undefined,
        OPENAI_BASE_URL: undefined,
        AI_TIMEOUT_MS: "30000",
      },
    });
  });

  it("lets a retryable failure reach the queue", async () => {
    execute.mockRejectedValueOnce(new Error("AI provider timed out after 30000 ms"));

    await expect(
      processor().process(jobOf(payload, { attemptsMade: 0, attempts: 2 })),
    ).rejects.toThrow(/timed out/);
  });
});
