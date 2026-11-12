import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { EXAMPLE_QUEUE, HEARTBEAT_JOB } from "./example.constants";
import { processHeartbeat, type HeartbeatJobData, type HeartbeatJobResult } from "./heartbeat";

@Processor(EXAMPLE_QUEUE)
export class ExampleProcessor extends WorkerHost {
  override async process(
    job: Job<HeartbeatJobData, HeartbeatJobResult>,
  ): Promise<HeartbeatJobResult> {
    if (job.name !== HEARTBEAT_JOB) {
      throw new Error(`Unsupported example job: ${job.name}`);
    }

    return processHeartbeat(job.data);
  }
}
