import { describe, expect, it } from "vitest";
import { ExampleProcessor } from "./example.processor";
import { HEARTBEAT_JOB } from "./example.constants";
import { processHeartbeat, type HeartbeatJobData } from "./heartbeat";
import type { Job } from "bullmq";

describe("processHeartbeat", () => {
  it("echoes the request time without external calls", () => {
    const result = processHeartbeat(
      { requestedAt: "2026-11-12T18:00:00.000Z" },
      new Date("2026-11-12T18:00:01.000Z"),
    );

    expect(result).toEqual({
      ok: true,
      requestedAt: "2026-11-12T18:00:00.000Z",
      processedAt: "2026-11-12T18:00:01.000Z",
    });
  });
});

describe("ExampleProcessor", () => {
  const processor = new ExampleProcessor();

  it("processes a heartbeat job", async () => {
    const job = {
      name: HEARTBEAT_JOB,
      data: { requestedAt: "2026-11-12T18:00:00.000Z" },
    } as Job<HeartbeatJobData>;

    const result = await processor.process(job);
    expect(result.ok).toBe(true);
    expect(result.requestedAt).toBe("2026-11-12T18:00:00.000Z");
  });

  it("rejects an unknown job name", async () => {
    const job = {
      name: "other",
      data: { requestedAt: "2026-11-12T18:00:00.000Z" },
    } as Job<HeartbeatJobData>;

    await expect(processor.process(job)).rejects.toThrow(/Unsupported example job/);
  });
});
