"use client";

import {
  PROCESSING_STAGE_LABELS,
  PROCESSING_STAGES,
  type DocumentProcessingProgress,
} from "@opero/shared";
import Link from "next/link";
import { useState } from "react";
import { DocumentUploadForm } from "../../../components/document-upload-form";
import { ExtractionReviewBoard } from "../../../components/extraction-review-board";
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
import { documentStatusLabel, documentStatusTone } from "../../../lib/document-status-labels";

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

const fixtureProgressIndeterminate: DocumentProcessingProgress = {
  ...fixtureProgress,
  progressPercent: null,
  nextRecommendedAction: "Processing without a reliable percentage",
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
    id: "1b",
    concept: "GROSS_PROFIT",
    labelRaw: "Gross profit",
    rawValue: "84,000",
    normalizedValue: "84000",
    actualMonetaryValue: "84000000",
    currency: "NGN",
    quantityClass: "MONETARY",
    unitScale: "THOUSANDS",
    scaleConfidence: "HIGH",
    unitScaleRequiresReview: false,
    quality: "HIGH",
    reviewStatus: "CONFIRMED",
    evidence: {
      evidenceKey: "grossprofitEvidence",
      pageNumber: 2,
      snippet: "Gross profit 84,000",
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
    labelRaw: "Gross profit margin",
    rawValue: "58.33%",
    normalizedValue: "58.33",
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
      snippet: "Gross profit margin 58.33%",
    },
  },
  {
    id: "3b",
    concept: "UNMAPPED",
    labelRaw: "Year ended 31 December 2024",
    rawValue: "2024",
    normalizedValue: "2024",
    actualMonetaryValue: null,
    currency: null,
    quantityClass: "DATE",
    unitScale: "ACTUAL",
    scaleConfidence: "HIGH",
    unitScaleRequiresReview: false,
    quality: "LOW",
    reviewStatus: "PENDING",
    evidence: {
      evidenceKey: "dateHeadingEvidence",
      pageNumber: 1,
      snippet: "Year ended 31 December 2024",
    },
  },
  {
    id: "3c",
    concept: "UNMAPPED",
    labelRaw: "net profit margin",
    rawValue: "12.50%",
    normalizedValue: "12.50",
    actualMonetaryValue: null,
    currency: null,
    quantityClass: "PERCENTAGE",
    unitScale: "ACTUAL",
    scaleConfidence: "HIGH",
    unitScaleRequiresReview: false,
    quality: "LOW",
    reviewStatus: "PENDING",
    evidence: {
      evidenceKey: "netMarginEvidence",
      pageNumber: 2,
      snippet: "net profit margin 12.50%",
    },
  },
  {
    id: "4",
    concept: "COST_OF_GOODS_SOLD",
    labelRaw: "Cost of sales",
    rawValue: "—",
    normalizedValue: null,
    actualMonetaryValue: null,
    currency: "NGN",
    quantityClass: "MONETARY",
    unitScale: "THOUSANDS",
    scaleConfidence: "LOW",
    unitScaleRequiresReview: true,
    quality: "LOW",
    reviewStatus: "PENDING",
    evidence: {
      evidenceKey: "mnop3456evidence",
      pageNumber: 2,
      snippet: "Cost of sales (illegible)",
    },
  },
  {
    id: "5",
    concept: "UNMAPPED",
    labelRaw: "Header noise",
    rawValue: "0",
    normalizedValue: "0",
    actualMonetaryValue: null,
    currency: null,
    quantityClass: "OTHER",
    unitScale: "ACTUAL",
    scaleConfidence: "HIGH",
    unitScaleRequiresReview: false,
    quality: "LOW",
    reviewStatus: "REJECTED",
    evidence: {
      evidenceKey: "rejectedEvidence",
      pageNumber: 1,
      snippet: "Header noise",
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
          <h1 className="text-3xl text-navy">Documents & extraction review specimens</h1>
          <p className="max-w-2xl text-sm text-text-secondary">
            Labelled fixtures for visual review, including Stage A extraction review intelligence.
            Live routes use the same components with real APIs.
          </p>
          <Link href="/design-system" className="text-sm font-medium text-navy no-underline hover:underline">
            ← Design system
          </Link>
        </header>

        <section className="space-y-3" data-testid="fixture-document-library">
          <h2 className="text-xl text-navy">Document library</h2>
          <Alert tone="info" title="Fixture preview">
            Sample filenames and statuses — not live tenant data.
          </Alert>
          <div
            className="hidden overflow-hidden rounded-2xl border border-border bg-surface md:block"
            data-testid="fixture-library-desktop"
          >
            <div className="grid gap-2 border-b border-border px-4 py-3 grid-cols-[1.4fr_5rem_9rem_8rem]">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Document
              </p>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Format
              </p>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Processing
              </p>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Uploaded
              </p>
            </div>
            {(
              [
                ["Netshift-FY2024.pdf", "PDF", "REVIEW_REQUIRED"],
                ["Netshift-FY2025.csv", "CSV", "READY"],
              ] as const
            ).map(([name, format, status]) => (
              <div
                key={name}
                className="grid gap-2 border-b border-border px-4 py-3 last:border-b-0 grid-cols-[1.4fr_5rem_9rem_8rem]"
              >
                <p className="font-medium text-navy">{name}</p>
                <p className="text-sm text-text-secondary">{format}</p>
                <Badge
                  tone={documentStatusTone(status)}
                  title={`processing status: ${status}`}
                  data-status={status}
                  className="max-w-full truncate"
                >
                  {documentStatusLabel("processing", status)}
                </Badge>
                <p className="font-data text-xs text-text-secondary">14 Nov 2026, 18:02</p>
              </div>
            ))}
          </div>

          <ul className="space-y-3 md:hidden" data-testid="fixture-library-mobile">
            {(
              [
                ["Netshift-FY2024.pdf", "PDF", "REVIEW_REQUIRED", "CLEAN", "SUCCEEDED"],
                ["Netshift-FY2025.csv", "CSV", "READY", "CLEAN", "SUCCEEDED"],
              ] as const
            ).map(([name, format, processing, scan, extraction]) => (
              <li key={name} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <p className="break-words font-semibold text-navy">{name}</p>
                <p className="mt-1 text-xs text-text-secondary">{format} · 14 Nov 2026, 18:02</p>
                <div className="mt-3 flex flex-wrap gap-2 overflow-hidden">
                  <Badge
                    tone={documentStatusTone(processing)}
                    title={`processing status: ${processing}`}
                    data-status={processing}
                    className="max-w-full truncate"
                  >
                    <span className="truncate">
                      {documentStatusLabel("processing", processing)}
                    </span>
                  </Badge>
                  <Badge
                    tone={documentStatusTone(scan)}
                    title={`scan status: ${scan}`}
                    data-status={scan}
                    className="max-w-full truncate"
                  >
                    <span className="truncate">Scan: {documentStatusLabel("scan", scan)}</span>
                  </Badge>
                  <Badge
                    tone={documentStatusTone(extraction)}
                    title={`extraction status: ${extraction}`}
                    data-status={extraction}
                    className="max-w-full truncate"
                  >
                    <span className="truncate">
                      Extract: {documentStatusLabel("extraction", extraction)}
                    </span>
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
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
            data-testid="fixture-toggle-duplicate"
          >
            Toggle duplicate-name advisory list (fixture only)
          </button>
        </section>

        <section className="space-y-3" data-testid="fixture-timeline">
          <h2 className="text-xl text-navy">Active processing timeline</h2>
          <ProcessingTimeline progress={fixtureProgress} elapsedLabel="Elapsed 42s" />
          <h3 className="text-base font-semibold text-navy">Stage-only progress (no percent)</h3>
          <ProcessingTimeline progress={fixtureProgressIndeterminate} elapsedLabel="Elapsed 12s" />
        </section>

        <section className="space-y-3" data-testid="fixture-extraction-review">
          <h2 className="text-xl text-navy">Extraction review intelligence</h2>
          <Alert tone="info" title="Fixture preview">
            Defaults to pending monetary figures. Open Contextual / non-diagnostic for DATE and
            percentage rows — filtering does not resolve document REVIEW_REQUIRED.
          </Alert>
          <ExtractionReviewBoard
            lines={fixtureLines}
            canWrite={false}
            onSubmitReview={async () => undefined}
          />
        </section>

        <section className="space-y-3" data-testid="fixture-scale-warning">
          <h2 className="text-xl text-navy">Ambiguous scale warning</h2>
          <ExtractionLineCard
            line={fixtureLines[1]!}
            canWrite={false}
            onSubmitReview={async () => undefined}
          />
        </section>

        <section className="space-y-3" data-testid="fixture-docs-empty">
          <h2 className="text-xl text-navy">Empty state</h2>
          <EmptyState
            title="No documents yet"
            description="Upload a PDF, XLSX or CSV financial statement to begin scanning and extraction."
            action={
              <button type="button" className={buttonClassName({ variant: "primary", size: "sm" })}>
                Upload document
              </button>
            }
          />
        </section>

        <section className="space-y-3" data-testid="fixture-docs-error">
          <h2 className="text-xl text-navy">Error state</h2>
          <Alert tone="error" title="Unable to load documents">
            <div className="space-y-3">
              <p>The documents API returned an error. Retry or check your connection.</p>
              <button type="button" className={buttonClassName({ variant: "secondary", size: "sm" })}>
                Retry
              </button>
            </div>
          </Alert>
        </section>
      </div>
    </div>
  );
}
