"use client";

import {
  PROCESSING_STAGE_LABELS,
  PROCESSING_STAGES,
  type DocumentProcessingProgress,
} from "@opero/shared";
import Link from "next/link";
import { useState } from "react";
import { DocumentUploadForm } from "../../../components/document-upload-form";
import {
  ExtractionLineCard,
  type ExtractionLine,
} from "../../../components/extraction-line-card";
import { ProcessingTimeline } from "../../../components/processing-timeline";
import {
  Alert,
  Badge,
  Breadcrumbs,
  EmptyState,
  buttonClassName,
} from "../../../components/ui";

const now = "2026-11-14T18:00:00.000Z";

const fixtureProgress: DocumentProcessingProgress = {
  documentId: "fixture-doc",
  organizationId: "fixture-org",
  currentStage: "IDENTIFYING_FIGURES",
  stageStatus: "RUNNING",
  overallStatus: "EXTRACTING",
  progressPercent: 55,
  stageStartedAt: now,
  stageCompletedAt: null,
  lastUpdatedAt: now,
  humanActionRequired: false,
  errorCategory: null,
  retryAvailable: false,
  nextRecommendedAction: "Extracting figures and units",
  stages: PROCESSING_STAGES.map((id, idx) => {
    const currentIdx = PROCESSING_STAGES.indexOf("IDENTIFYING_FIGURES");
    let status: DocumentProcessingProgress["stages"][number]["status"] = "PENDING";
    if (idx < currentIdx) status = "COMPLETED";
    else if (idx === currentIdx) status = "RUNNING";
    if (
      (id === "CALCULATING_DIAGNOSTICS" || id === "PREPARING_RESULTS") &&
      idx > currentIdx
    ) {
      status = "SKIPPED";
    }
    return {
      id,
      label: PROCESSING_STAGE_LABELS[id],
      status,
      startedAt: idx === currentIdx ? now : null,
      completedAt: idx < currentIdx ? now : null,
    };
  }),
};

const fixtureLines: ExtractionLine[] = [
  {
    id: "1",
    concept: "REVENUE",
    labelRaw: "Revenue of",
    rawValue: "144,000",
    normalizedValue: "144000",
    actualMonetaryValue: "144000000",
    currency: "NGN",
    quantityClass: "MONETARY",
    unitScale: "THOUSANDS",
    scaleConfidence: "HIGH",
    unitScaleRequiresReview: false,
    quality: "HIGH",
    reviewStatus: "PENDING",
    evidence: {
      evidenceKey: "abcd1234evidence",
      pageNumber: 2,
      snippet: "Revenue of 144,000",
    },
  },
  {
    id: "2",
    concept: "UNMAPPED",
    labelRaw: "Other income",
    rawValue: "12,500",
    normalizedValue: "12500",
    actualMonetaryValue: "12500000",
    currency: "NGN",
    quantityClass: "MONETARY",
    unitScale: "THOUSANDS",
    scaleConfidence: "AMBIGUOUS",
    unitScaleRequiresReview: true,
    quality: "LOW",
    reviewStatus: "PENDING",
    evidence: {
      evidenceKey: "efgh5678evidence",
      pageNumber: 2,
      snippet: "Other income 12,500",
    },
  },
  {
    id: "3",
    concept: "UNMAPPED",
    labelRaw: "Gross margin",
    rawValue: "58.3%",
    normalizedValue: "58.3",
    actualMonetaryValue: null,
    currency: null,
    quantityClass: "PERCENTAGE",
    unitScale: "ACTUAL",
    scaleConfidence: "HIGH",
    unitScaleRequiresReview: false,
    quality: "LOW",
    reviewStatus: "PENDING",
    evidence: {
      evidenceKey: "ijkl9012evidence",
      pageNumber: 2,
      snippet: "Gross margin 58.3%",
    },
  },
];

export default function DocumentsDesignSpecimen() {
  const [showUploadError, setShowUploadError] = useState(false);

  return (
    <div className="min-h-dvh bg-workspace px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="space-y-2">
          <Breadcrumbs
            items={[
              { label: "Design system", href: "/design-system" },
              { label: "Documents" },
            ]}
          />
          <h1 className="text-3xl text-navy">Phase 9D documents specimens</h1>
          <p className="max-w-2xl text-sm text-text-secondary">
            Labelled fixtures for visual review. Live routes use the same components with real APIs.
          </p>
          <Link href="/design-system" className="text-sm font-medium text-emerald">
            ← Design system
          </Link>
        </header>

        <section className="space-y-3" data-testid="fixture-document-library">
          <h2 className="text-xl text-navy">Document library</h2>
          <Alert tone="info" title="Fixture preview">
            Sample filenames and statuses — not live tenant data.
          </Alert>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="grid gap-2 border-b border-border px-4 py-3 sm:grid-cols-[1.4fr_5rem_8rem_8rem]">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Document
              </p>
              <p className="hidden text-xs font-semibold uppercase tracking-wide text-text-secondary sm:block">
                Format
              </p>
              <p className="hidden text-xs font-semibold uppercase tracking-wide text-text-secondary sm:block">
                Processing
              </p>
              <p className="hidden text-xs font-semibold uppercase tracking-wide text-text-secondary sm:block">
                Uploaded
              </p>
            </div>
            {[
              ["Netshift-FY2024.pdf", "PDF", "REVIEW_REQUIRED", "warning"],
              ["Netshift-FY2025.csv", "CSV", "READY", "success"],
            ].map(([name, format, status, tone]) => (
              <div
                key={name}
                className="grid gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[1.4fr_5rem_8rem_8rem]"
              >
                <p className="font-medium text-navy">{name}</p>
                <p className="text-sm text-text-secondary">{format}</p>
                <Badge tone={tone as "warning" | "success"}>{status}</Badge>
                <p className="font-data text-xs text-text-secondary">14 Nov 2026, 18:02</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3" data-testid="fixture-upload">
          <h2 className="text-xl text-navy">Upload interface</h2>
          <DocumentUploadForm
            orgId="fixture-org"
            disabled={false}
            existingFilenames={showUploadError ? ["duplicate.pdf"] : []}
            onUploaded={async () => undefined}
          />
          <button
            type="button"
            className={buttonClassName({ variant: "secondary", size: "sm" })}
            onClick={() => setShowUploadError((v) => !v)}
          >
            Toggle duplicate-name guard list
          </button>
        </section>

        <section className="space-y-3" data-testid="fixture-timeline">
          <h2 className="text-xl text-navy">Active processing timeline</h2>
          <ProcessingTimeline progress={fixtureProgress} elapsedLabel="Elapsed 42s" />
        </section>

        <section className="space-y-3" data-testid="fixture-extraction-review">
          <h2 className="text-xl text-navy">Extraction review</h2>
          <Alert tone="warning" title="Human confirmation required">
            Mixed mapped, unmapped and non-monetary lines — fixture sample.
          </Alert>
          <ul className="space-y-4">
            {fixtureLines.map((line) => (
              <ExtractionLineCard
                key={line.id}
                line={line}
                canWrite={false}
                onReview={async () => undefined}
              />
            ))}
          </ul>
        </section>

        <section className="space-y-3" data-testid="fixture-docs-empty">
          <h2 className="text-xl text-navy">Empty state</h2>
          <EmptyState
            title="No documents yet"
            description="Upload a PDF, XLSX or CSV financial statement to begin scanning and extraction."
          />
        </section>

        <section className="space-y-3" data-testid="fixture-docs-error">
          <h2 className="text-xl text-navy">Error state</h2>
          <Alert tone="error" title="Unable to load documents">
            The documents API returned an error. Retry or check your connection.
          </Alert>
        </section>
      </div>
    </div>
  );
}
