import type { ConfigService } from "@nestjs/config";
import type { PrismaClient } from "@opero/database";
import type { ObjectStoragePort } from "@opero/object-storage";
import type { ReportRenderJobPayload } from "@opero/shared";
import type { Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerEnv } from "../config/env";
import { renderReportVersion } from "./render-report-version";
import { ReportRenderProcessor } from "./report-render.processor";
import { REPORT_RENDER_JOB } from "./reports.constants";

vi.mock("./render-report-version", () => ({
  renderReportVersion: vi.fn(async () => "SKIPPED"),
}));

const render = vi.mocked(renderReportVersion);

const payload: ReportRenderJobPayload = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  reportId: "22222222-2222-4222-8222-222222222222",
  reportVersionId: "33333333-3333-4333-8333-333333333333",
  actorUserId: "44444444-4444-4444-8444-444444444444",
};

function processor() {
  // Any database or storage access from the processor itself would throw.
  const untouchable = () =>
    new Proxy({}, { get: () => { throw new Error("unexpected access"); } });
  const config = {
    get: (key: string) => (key === "S3_DOCUMENTS_BUCKET" ? "documents" : undefined),
  } as unknown as ConfigService<WorkerEnv, true>;
  return new ReportRenderProcessor(
    untouchable() as PrismaClient,
    untouchable() as ObjectStoragePort,
    config,
  );
}

function jobOf(data: unknown, name: string = REPORT_RENDER_JOB): Job<ReportRenderJobPayload> {
  return { name, data, attemptsMade: 0, opts: { attempts: 3 } } as unknown as Job<ReportRenderJobPayload>;
}

describe("ReportRenderProcessor", () => {
  beforeEach(() => render.mockClear());

  it("ignores jobs it does not own", async () => {
    await processor().process(jobOf(payload, "something.else"));

    expect(render).not.toHaveBeenCalled();
  });

  it.each([
    ["no payload", undefined, /tenant context/],
    ["no organization", { ...payload, organizationId: undefined }, /tenant context/],
    ["an empty organization", { ...payload, organizationId: "" }, /tenant context/],
    ["no actor", { ...payload, actorUserId: "" }, /tenant context/],
    ["no report", { ...payload, reportId: "" }, /report identifiers/],
    ["no version", { ...payload, reportVersionId: undefined }, /report identifiers/],
  ])("rejects a job with %s before touching storage", async (_label, data, message) => {
    await expect(processor().process(jobOf(data))).rejects.toThrow(message);

    expect(render).not.toHaveBeenCalled();
  });

  it("renders with the tenant payload and the configured bucket", async () => {
    await processor().process(jobOf(payload));

    expect(render).toHaveBeenCalledTimes(1);
    const [, , bucket, job] = render.mock.calls[0]!;
    expect(bucket).toBe("documents");
    expect(job).toEqual(payload);
  });

  it("lets a failed render reach the queue so it is retried", async () => {
    render.mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(processor().process(jobOf(payload))).rejects.toThrow(/storage unavailable/);
  });
});
