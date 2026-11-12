export interface HeartbeatJobData {
  requestedAt: string;
}

export interface HeartbeatJobResult {
  ok: true;
  requestedAt: string;
  processedAt: string;
}

/**
 * Local example job. It echoes a timestamp and does not call external services.
 */
export function processHeartbeat(
  data: HeartbeatJobData,
  now: Date = new Date(),
): HeartbeatJobResult {
  return {
    ok: true,
    requestedAt: data.requestedAt,
    processedAt: now.toISOString(),
  };
}
