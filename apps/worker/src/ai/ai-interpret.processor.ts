import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PrismaClient } from "@opero/database";
import type { AiInterpretJobPayload } from "@opero/shared";
import type { Job } from "bullmq";
import type { WorkerEnv } from "../config/env";
import { assertTenantJobContext } from "../tenant/job-context";
import { AI_INTERPRET_JOB, AI_QUEUE_NAME, PRISMA_CLIENT } from "./ai.constants";
import { executeAiInterpretation } from "./execute-ai-interpretation";

@Processor(AI_QUEUE_NAME)
export class AiInterpretProcessor extends WorkerHost {
  private readonly logger = new Logger(AiInterpretProcessor.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly config: ConfigService<WorkerEnv, true>,
  ) {
    super();
  }

  async process(job: Job<AiInterpretJobPayload>): Promise<void> {
    if (job.name !== AI_INTERPRET_JOB) return;

    assertTenantJobContext(job.data);
    const { aiInterpretationRunId, userNotes } = job.data;
    if (typeof aiInterpretationRunId !== "string" || aiInterpretationRunId.length === 0) {
      throw new Error("Job payload missing aiInterpretationRunId");
    }
    if (userNotes !== undefined && typeof userNotes !== "string") {
      throw new Error("Job payload userNotes must be a string");
    }

    // Retries are bounded by the attempts the API set when enqueueing.
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const outcome = await executeAiInterpretation(
      this.prisma,
      {
        shareStructuredContext: this.config.get("AI_SHARE_STRUCTURED_CONTEXT", { infer: true }),
        providerEnv: {
          AI_PROVIDER: this.config.get("AI_PROVIDER", { infer: true }),
          OPENAI_API_KEY: this.config.get("OPENAI_API_KEY", { infer: true }),
          OPENAI_MODEL: this.config.get("OPENAI_MODEL", { infer: true }),
          OPENAI_BASE_URL: this.config.get("OPENAI_BASE_URL", { infer: true }),
          AI_TIMEOUT_MS: String(this.config.get("AI_TIMEOUT_MS", { infer: true })),
        },
      },
      job.data,
      { finalAttempt },
    );
    this.logger.log(`AI interpretation ${aiInterpretationRunId} finished: ${outcome}`);
  }
}
