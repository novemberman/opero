/**
 * Redacts paid X-Ray report content for free-tier responses.
 * Never include full AI narratives, dense KPI tables, or exportable detail.
 */
export function redactPaidReportPreview(preview: unknown): {
  access: "FREE_PREVIEW";
  summary: string;
  limitedKpis: unknown[];
  findingsSummary: string[];
  upgradeRequired: true;
  productCode: "XRAY_PRO";
} {
  const model = (preview ?? {}) as {
    summary?: string;
    metrics?: Array<{ code?: string; label?: string; value?: unknown }>;
    findings?: Array<{ title?: string; severity?: string }>;
    narrative?: { summary?: string };
  };

  const limitedKpis = (model.metrics ?? [])
    .slice(0, 3)
    .map((row) => ({
      code: row.code,
      label: row.label,
      // Values stay high-level; free tier shows presence, not full precision tables.
      available: row.value != null,
    }));

  const findingsSummary = (model.findings ?? [])
    .slice(0, 5)
    .map((row) => `${row.severity ?? "INFO"}: ${row.title ?? "Finding"}`);

  return {
    access: "FREE_PREVIEW",
    summary:
      model.narrative?.summary?.slice(0, 280) ||
      model.summary?.slice(0, 280) ||
      "Limited diagnostic preview. Unlock X-Ray Pro for the full report and PDF.",
    limitedKpis,
    findingsSummary,
    upgradeRequired: true,
    productCode: "XRAY_PRO",
  };
}
