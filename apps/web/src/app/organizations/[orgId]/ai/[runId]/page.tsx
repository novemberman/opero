"use client";

import { roleHasPermission, type MembershipRole } from "@opero/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { GroundingPanel, type Claim } from "../../../../../components/ai/grounding-panel";
import {
  NarrativeEditor,
  NarrativePanel,
  type Narrative,
} from "../../../../../components/ai/narrative-panel";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Skeleton,
  buttonClassName,
} from "../../../../../components/ui";
import { aiRunStatusPresentation } from "../../../../../lib/ai-interpretation-presentation";
import { apiErrorMessage, apiFetch } from "../../../../../lib/api";
import { fetchOrgRole } from "../../../../../lib/xray";

type Version = {
  id: string;
  versionNumber: number;
  narrative: Narrative;
  editedNarrative: Narrative | null;
  editedByUserId: string | null;
  groundedClaims: Claim[];
  unsupportedClaims: Claim[];
  isSimulated: boolean;
  createdAt: string;
};

type Interpretation = {
  id: string;
  diagnosticRunId: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "UNAVAILABLE";
  provider: string;
  model: string | null;
  promptVersion: string;
  failureMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  versions: Version[];
};

export default function AiInterpretationPage() {
  const { orgId, runId } = useParams<{ orgId: string; runId: string }>();
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [role, setRole] = useState<MembershipRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const canWrite = role ? roleHasPermission(role, "xray:write") : false;
  const pending = interpretation?.status === "QUEUED" || interpretation?.status === "RUNNING";

  const load = useCallback(async () => {
    const { status, body } = await apiFetch<{ run?: Interpretation; message?: string }>(
      `/organizations/${orgId}/ai/interpretations/${runId}`,
    );
    if (status >= 400 || !body.run) {
      setError(apiErrorMessage(body, "Unable to load the AI interpretation"));
      setLoading(false);
      return;
    }
    setInterpretation(body.run);
    setError(null);
    setLoading(false);
  }, [orgId, runId]);

  useEffect(() => {
    void load();
    void fetchOrgRole(orgId).then(setRole);
  }, [load, orgId]);

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [pending, load]);

  const version = interpretation?.versions[0] ?? null;
  const current = version ? (version.editedNarrative ?? version.narrative) : null;
  const statusPresentation = interpretation
    ? aiRunStatusPresentation(interpretation.status)
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-8" data-testid="ai-interpretation-detail">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald">
            Opero X-Ray
          </p>
          <h1 className="mt-2 text-3xl text-navy">AI interpretation draft</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {statusPresentation ? (
              <Badge tone={statusPresentation.tone}>{statusPresentation.label}</Badge>
            ) : null}
            {interpretation ? <Badge tone="neutral">{interpretation.provider}</Badge> : null}
            {interpretation?.model ? <Badge tone="neutral">{interpretation.model}</Badge> : null}
          </div>
        </div>
        <Link
          className={buttonClassName({ variant: "ghost", size: "sm" })}
          href={`/organizations/${orgId}/ai`}
        >
          All interpretations
        </Link>
      </header>

      {error ? (
        <Alert tone="error" title="Unable to load interpretation">
          <div className="space-y-3">
            <p>{error}</p>
            <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {loading && !interpretation ? (
        <div className="space-y-3" data-testid="ai-detail-loading">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : null}

      {pending && statusPresentation ? (
        <Alert tone="info" title={statusPresentation.label}>
          {statusPresentation.body}
        </Alert>
      ) : null}

      {interpretation?.status === "UNAVAILABLE" ? (
        <Alert tone="warning" title="AI interpretation was unavailable">
          {interpretation.failureMessage ?? "The AI provider could not be reached."} No draft was
          produced. The diagnostic and any report are unaffected.
        </Alert>
      ) : null}

      {interpretation?.status === "FAILED" ? (
        <Alert tone="error" title="The interpretation failed">
          {interpretation.failureMessage ?? "The provider did not return a usable draft."} No draft
          was stored.
        </Alert>
      ) : null}

      {interpretation && version && current ? (
        <>
          <Card>
            <CardHeader
              title="How to read this draft"
              description="Keep deterministic calculations, AI text, evidence grounding and human edits distinct."
            />
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-text-secondary">
              <li>
                <strong className="text-navy">Deterministic calculations</strong> live on the linked
                diagnostic run — ratios, score eligibility and findings.
              </li>
              <li>
                <strong className="text-navy">AI-generated interpretation</strong> is a narrative
                draft only; it must not introduce unsupported figures.
              </li>
              <li>
                <strong className="text-navy">Source evidence</strong> is validated by the grounding
                check against metric codes and finding ids.
              </li>
              <li>
                <strong className="text-navy">Human-reviewed conclusions</strong> appear when an
                analyst saves an edit alongside the original draft.
              </li>
            </ul>
          </Card>

          <NarrativePanel
            narrative={current}
            original={version.editedNarrative ? version.narrative : null}
            isSimulated={version.isSimulated}
            isEdited={Boolean(version.editedNarrative)}
            promptVersion={interpretation.promptVersion}
          />

          <GroundingPanel
            groundedClaims={version.groundedClaims}
            unsupportedClaims={version.unsupportedClaims}
            coversEditedNarrative={Boolean(version.editedNarrative)}
          />

          <Card>
            <CardHeader
              title="Human review"
              description="Edits are stored next to the generated draft and marked as reviewer-edited."
            />
            {canWrite ? (
              <NarrativeEditor
                key={version.id}
                path={`/organizations/${orgId}/ai/interpretations/${interpretation.id}/versions/${version.id}/edit`}
                current={current}
                onSaved={load}
              />
            ) : (
              <Alert tone="info" title="View-only access">
                Editing the draft requires Analyst or higher.
              </Alert>
            )}
          </Card>
        </>
      ) : null}

      {interpretation ? (
        <Card>
          <CardHeader title="Related" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              className={buttonClassName({ variant: "secondary", size: "sm" })}
              href={`/organizations/${orgId}/diagnostics/${interpretation.diagnosticRunId}`}
            >
              Diagnostic run
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary", size: "sm" })}
              href={`/organizations/${orgId}/reports?run=${interpretation.diagnosticRunId}`}
            >
              Create a report
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
