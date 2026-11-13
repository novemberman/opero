import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PrismaClient } from "@opero/database";
import type { ObjectStoragePort } from "@opero/object-storage";
import type { ReportRenderJobPayload } from "@opero/shared";
import type { Job } from "bullmq";
import type { WorkerEnv } from "../config/env";
import { OBJECT_STORAGE } from "../documents/documents.constants";
import { assertTenantJobContext } from "../tenant/job-context";
import { renderReportVersion } from "./render-report-version";
import { PRISMA_CLIENT, REPORT_RENDER_JOB, REPORTS_QUEUE_NAME } from "./reports.constants";

@Processor(REPORTS_QUEUE_NAME)
export class ReportRenderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportRenderProcessor.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    private readonly config: ConfigService<WorkerEnv, true>,
  ) {
    super();
  }

  /** Retries are bounded by the attempts the API set when enqueueing. */
  async process(job: Job<ReportRenderJobPayload>): Promise<void> {
    if (job.name !== REPORT_RENDER_JOB) return;

    assertTenantJobContext(job.data);
    const { reportId, reportVersionId } = job.data;
    if (
      typeof reportId !== "string" ||
      typeof reportVersionId !== "string" ||
      reportId.length === 0 ||
      reportVersionId.length === 0
    ) {
      throw new Error("Job payload missing report identifiers");
    }

    const outcome = await renderReportVersion(
      this.prisma,
      this.storage,
      this.config.get("S3_DOCUMENTS_BUCKET", { infer: true }),
      job.data,
    );
    this.logger.log(`Report version ${reportVersionId} render: ${outcome}`);
  }
}
