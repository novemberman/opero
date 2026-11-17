"use client";

import Link from "next/link";
import { AiAvailabilityBanner } from "../../../components/ai/availability-banner";
import { GroundingPanel } from "../../../components/ai/grounding-panel";
import { NarrativePanel } from "../../../components/ai/narrative-panel";
import { FindingCard } from "../../../components/diagnostics/finding-card";
import { HealthScorePanel } from "../../../components/diagnostics/health-score-panel";
import { MetricDimensionSections } from "../../../components/diagnostics/metric-dimension-section";
import { ReadinessChecklist } from "../../../components/readiness/readiness-checklist";
import { ReadinessIssues } from "../../../components/readiness/readiness-issues";
import { ReadinessStatusPanel } from "../../../components/readiness/readiness-status-panel";
import {
  Alert,
  Badge,
  Breadcrumbs,
  EmptyState,
  Skeleton,
  buttonClassName,
} from "../../../components/ui";

const scoredFixture = {
  status: "SCORED",
  overallScore: 72,
  limitations: [
    "Provisional heuristics — not industry benchmarks",
    "Efficiency dimension excluded due to insufficient inputs",
  ],
  components: [
    {
      dimension: "profitability",
      weight: 25,
      included: true,
      score: 78,
      exclusionReason: null,
      metricCodes: ["GROSS_MARGIN", "NET_MARGIN"],
    },
    {
      dimension: "liquidity",
      weight: 20,
      included: true,
      score: 70,
      exclusionReason: null,
      metricCodes: ["CURRENT_RATIO"],
    },
    {
      dimension: "leverage",
      weight: 20,
      included: true,
      score: 65,
      exclusionReason: null,
      metricCodes: ["DEBT_TO_EQUITY"],
    },
    {
      dimension: "efficiency",
      weight: 15,
      included: false,
      score: null,
      exclusionReason: "Insufficient computed metrics",
      metricCodes: [],
    },
    {
      dimension: "cash_flow",
      weight: 20,
      included: true,
      score: 74,
      exclusionReason: null,
      metricCodes: ["OCF_MARGIN"],
    },
  ],
};

const withheldFixture = {
  status: "INSUFFICIENT_DATA",
  overallScore: null,
  limitations: [
    "diagnosticCoverage below eligibility threshold",
    "Fewer than three included dimensions",
  ],
  components: scoredFixture.components.map((c) =>
    c.dimension === "profitability" || c.dimension === "liquidity"
      ? c
      : { ...c, included: false, score: null, exclusionReason: "Insufficient inputs" },
  ),
};

const qualityFixture = {
  completeness: "0.82",
  consistency: "0.91",
  evidenceReliability: "0.76",
  diagnosticCoverage: "0.71",
  details: { missingDimensions: ["efficiency"] },
};

const metricsFixture = [
  {
    code: "GROSS_MARGIN",
    label: "Gross margin",
    dimension: "profitability",
    status: "COMPUTED",
    value: "0.412",
    unit: "ratio",
    formulaId: "gross_margin.v1",
    periodLabel: "FY2024",
    inputRefs: ["snap:rev", "snap:cogs"],
    warnings: [],
  },
  {
    code: "NET_MARGIN",
    label: "Net margin",
    dimension: "profitability",
    status: "COMPUTED",
    value: "0.118",
    unit: "ratio",
    formulaId: "net_margin.v1",
    periodLabel: "FY2024",
    inputRefs: ["snap:ni", "snap:rev"],
    warnings: [],
  },
  {
    code: "CURRENT_RATIO",
    label: "Current ratio",
    dimension: "liquidity",
    status: "COMPUTED",
    value: "1.45",
    unit: "ratio",
    formulaId: "current_ratio.v1",
    periodLabel: "FY2024",
    inputRefs: ["snap:ca", "snap:cl"],
    warnings: [],
  },
  {
    code: "QUICK_RATIO",
    label: "Quick ratio",
    dimension: "liquidity",
    status: "INSUFFICIENT_INPUTS",
    value: null,
    unit: "ratio",
    formulaId: "quick_ratio.v1",
    periodLabel: "FY2024",
    inputRefs: [],
    warnings: ["Inventory not available in snapshot"],
  },
  {
    code: "DEBT_TO_EQUITY",
    label: "Debt to equity",
    dimension: "leverage",
    status: "COMPUTED",
    value: "0.62",
    unit: "ratio",
    formulaId: "dte.v1",
    periodLabel: "FY2024",
    inputRefs: ["snap:td", "snap:eq"],
    warnings: [],
  },
  {
    code: "OCF_MARGIN",
    label: "Operating cash-flow margin",
    dimension: "cash_flow",
    status: "COMPUTED",
    value: "0.09",
    unit: "ratio",
    formulaId: "ocf_margin.v1",
    periodLabel: "FY2024",
    inputRefs: ["snap:ocf", "snap:rev"],
    warnings: [],
  },
];

export default function DiagnosticsDesignSpecimen() {
  return (
    <div className="min-h-dvh bg-workspace px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="space-y-2">
          <Breadcrumbs
            items={[
              { label: "Design system", href: "/design-system" },
              { label: "Diagnostics" },
            ]}
          />
          <h1 className="text-3xl text-navy">Phase 9E diagnostics specimens</h1>
          <p className="max-w-2xl text-sm text-text-secondary">
            Labelled fixtures for visual review. Live routes use the same components with real APIs.
            No fictional time series.
          </p>
          <Link href="/design-system" className="text-sm font-medium text-emerald">
            ← Design system
          </Link>
        </header>

        <section className="space-y-3" data-testid="fixture-diagnostics-overview">
          <h2 className="text-xl text-navy">Diagnostics overview</h2>
          <Alert tone="info" title="Fixture preview">
            Sample Business Health Score and run list — not live tenant data.
          </Alert>
          <HealthScorePanel
            runStatus="SUCCEEDED"
            score={scoredFixture}
            quality={qualityFixture}
          />
          <ul className="space-y-3">
            <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
              <div>
                <p className="font-medium text-navy">Run a1b2c3d4…</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone="success">SUCCEEDED</Badge>
                  <Badge tone="success">Eligible</Badge>
                  <Badge tone="neutral">NGN</Badge>
                  <Badge tone="neutral">FY2024</Badge>
                  <span className="font-data text-sm text-emerald">Score 72</span>
                </div>
              </div>
              <time className="font-data text-xs text-text-secondary">14 Nov 2026, 18:10</time>
            </li>
          </ul>
        </section>

        <section className="space-y-3" data-testid="fixture-health-score">
          <h2 className="text-xl text-navy">Business Health Score</h2>
          <HealthScorePanel
            runStatus="SUCCEEDED"
            score={scoredFixture}
            quality={qualityFixture}
          />
        </section>

        <section className="space-y-3" data-testid="fixture-withheld-score">
          <h2 className="text-xl text-navy">Missing-data / withheld score</h2>
          <HealthScorePanel runStatus="SUCCEEDED" score={withheldFixture} quality={qualityFixture} />
        </section>

        <section className="space-y-3" data-testid="fixture-metrics">
          <h2 className="text-xl text-navy">Financial ratio analysis</h2>
          <MetricDimensionSections metrics={metricsFixture} />
        </section>

        <section className="space-y-3" data-testid="fixture-evidence">
          <h2 className="text-xl text-navy">Evidence detail</h2>
          <FindingCard
            orgId="fixture-org"
            finding={{
              id: "finding-1",
              ruleId: "liquidity.current_ratio.low",
              category: "RISK",
              severity: "MEDIUM",
              title: "Current ratio below internal heuristic band",
              explanation:
                "Computed current ratio is below the provisional heuristic used for investigation prompts.",
              implication: "Short-term coverage warrants review of working-capital evidence.",
              suggestedAction: "Confirm current assets and liabilities line items on source statements.",
              confidence: "0.71",
              supportingMetrics: ["CURRENT_RATIO"],
              evidence: [
                {
                  snapshotKey: "snap:ca",
                  documentId: "doc-fixture-1",
                  lineItemId: "line-fixture-1",
                  evidenceReferenceId: "ev-fixture-1",
                  label: "Total current assets",
                },
                {
                  snapshotKey: "snap:cl",
                  documentId: "doc-fixture-1",
                  lineItemId: "line-fixture-2",
                  evidenceReferenceId: "ev-fixture-2",
                  label: "Total current liabilities",
                },
              ],
            }}
          />
        </section>

        <section className="space-y-3" data-testid="fixture-readiness">
          <h2 className="text-xl text-navy">Readiness assessment</h2>
          <ReadinessStatusPanel
            status="ACTION_REQUIRED"
            createdAt="2026-11-14T18:20:00.000Z"
            documentCount={2}
            blockingReasons={[]}
          />
          <ReadinessChecklist
            items={[
              {
                id: "documents_present",
                label: "At least one document selected",
                passed: true,
                required: true,
              },
              {
                id: "reviews_complete",
                label: "Material monetary figures confirmed",
                passed: false,
                required: true,
                detail: "3 material monetary line(s) still need human confirmation",
              },
              {
                id: "currency_present",
                label: "Currency present on statements",
                passed: true,
                required: true,
              },
            ]}
          />
          <ReadinessIssues
            orgId="fixture-org"
            documentIds={["doc-fixture-1"]}
            diagnosticRunId="run-fixture-1"
            issues={[
              {
                code: "PENDING_REVIEWS",
                severity: "MEDIUM",
                title: "Pending extraction reviews",
                detail: "3 line item(s) have not been confirmed or corrected",
                blocking: false,
              },
              {
                code: "METADATA_UNCONFIRMED",
                severity: "MEDIUM",
                title: "Statement metadata not confirmed",
                detail: "1 document(s) need metadata review",
                blocking: false,
              },
            ]}
          />
        </section>

        <section className="space-y-3" data-testid="fixture-ai">
          <h2 className="text-xl text-navy">AI interpretation</h2>
          <AiAvailabilityBanner
            availability={{
              provider: "simulated",
              simulated: true,
              shareStructuredContext: true,
              available: true,
              reason: null,
            }}
          />
          <NarrativePanel
            isSimulated
            isEdited={false}
            promptVersion="ai.interpret.v2"
            narrative={{
              summary:
                "Fixture narrative only. Gross margin and liquidity measures are present; efficiency inputs remain incomplete.",
              profitabilityInterpretation:
                "Gross margin [GROSS_MARGIN] = 0.412 ratio for FY2024. Net margin evidence remains limited.",
              liquidityInterpretation:
                "Current ratio is computed; quick ratio is unavailable because inventory inputs are missing.",
              solvencyInterpretation: "",
              efficiencyInterpretation:
                "Efficiency interpretation withheld — required turnover inputs are incomplete.",
              cashFlowInterpretation: "",
              dataQualityExplanation:
                "Efficiency dimension excluded from the Business Health Score due to insufficient inputs.",
              trendCommentary: "",
              keyObservations: [
                "Gross margin computed at 0.412 for FY2024.",
                "Current ratio computed; quick ratio unavailable.",
              ],
              risks: ["Working-capital coverage warrants evidence review."],
              recommendations: [
                "Confirm current assets and liabilities line items on source statements.",
              ],
              limitations: [
                "Simulated provider — not live model output.",
                "Efficiency dimension excluded from the score.",
              ],
            }}
          />
          <GroundingPanel
            coversEditedNarrative={false}
            groundedClaims={[
              {
                text: "Gross margin is 0.412 for FY2024.",
                groundedMetricCodes: ["GROSS_MARGIN"],
              },
            ]}
            unsupportedClaims={[
              {
                text: "The company is creditworthy for expansion lending.",
                reasons: ["RESTRICTED_LANGUAGE", "NO_REFERENCES"],
                restrictedTerms: ["creditworthy"],
              },
            ]}
          />
        </section>

        <section className="space-y-3" data-testid="fixture-report-lifecycle">
          <h2 className="text-xl text-navy">Report generation and access</h2>
          <Alert tone="info" title="Generation in progress">
            <p data-testid="report-generation-progress">
              Report version queued. Worker renders the PDF from the frozen diagnostic snapshot;
              status polls until READY or FAILED.
            </p>
          </Alert>
          <div
            className="rounded-2xl border border-border bg-surface px-4 py-3"
            data-testid="report-status-panel"
          >
            <p className="font-medium text-navy">Financial analysis — FY2024</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="success">PUBLISHED</Badge>
              <Badge tone="warning">FREE_PREVIEW</Badge>
              <Badge tone="neutral">NGN</Badge>
              <span className="font-data text-sm text-emerald">Score 72</span>
            </div>
            <p className="mt-2 text-sm text-text-secondary">
              Full PDF download stays locked until X-Ray Pro entitlement is verified. Preview shows
              limited KPIs only — unsupported metrics are omitted, never shown as zero.
            </p>
            <button
              type="button"
              className={buttonClassName({ variant: "secondary", size: "sm" })}
              data-testid="report-download-locked"
              disabled
            >
              Download PDF (locked)
            </button>
          </div>
          <Alert tone="warning" title="Cross-tenant access denied">
            <p data-testid="report-cross-tenant-denial">
              Requests for another organization&apos;s report return 404/403 — object keys are
              tenant-scoped and download authorization is checked before storage read.
            </p>
          </Alert>
        </section>

        <section className="space-y-3" data-testid="fixture-loading">
          <h2 className="text-xl text-navy">Loading state</h2>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-16 w-full" />
        </section>

        <section className="space-y-3" data-testid="fixture-error">
          <h2 className="text-xl text-navy">Error state</h2>
          <Alert tone="error" title="Unable to load diagnostics">
            <div className="space-y-3">
              <p>The diagnostics API returned an error. Retry or check your connection.</p>
              <button type="button" className={buttonClassName({ variant: "secondary", size: "sm" })}>
                Retry
              </button>
            </div>
          </Alert>
          <EmptyState
            title="No completed diagnostics yet"
            description="Run diagnostics on clean-scanned documents to see Business Health Score eligibility."
          />
        </section>
      </div>
    </div>
  );
}
