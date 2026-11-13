export {
  assembleReportModel,
  DEFAULT_REPORT_TITLE,
  DISCLOSURES,
  type AssembleReportOptions,
  type ReportAiNarrativeInput,
  type ReportPayloadFinding,
  type ReportPayloadMetric,
  type ReportSnapshotPayload,
} from "./assemble.js";
export type {
  ReportAiNarrative,
  ReportFinding,
  ReportMetric,
  ReportModel,
  ReportQuality,
  ReportScore,
} from "./model.js";
export {
  FOOTER_DISCLOSURE,
  formatMetricValue,
  LIVE_AI_LABEL,
  NON_VERIFIED_BANNER,
  renderReportPdf,
  SIMULATED_AI_LABEL,
  toPdfText,
} from "./pdf.js";
