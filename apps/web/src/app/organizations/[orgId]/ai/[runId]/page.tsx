"use client";

import { roleHasPermission, type MembershipRole } from "@opero/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { SiteHeader } from "../../../../../components/site-header";
import { apiErrorMessage, apiFetch } from "../../../../../lib/api";
import { fetchOrgRole, splitLines } from "../../../../../lib/xray";

type Narrative = {
  summary?: string;
  keyObservations?: string[];
  risks?: string[];
  limitations?: string[];
};

type Claim = {
  text: string;
  groundedMetricCodes?: string[];
  groundedFindingIds?: string[];
  reasons?: string[];
  unknownMetricCodes?: string[];
  unknownFindingIds?: string[];
  unsupportedNumbers?: string[];
  restrictedTerms?: string[];
};

/** The references, figures and phrases a flagged statement was flagged for. */
function flaggedDetails(claim: Claim): string[] {
  return [
    ...(claim.unknownMetricCodes ?? []),
    ...(claim.unknownFindingIds ?? []),
    ...(claim.unsupportedNumbers ?? []),
    ...(claim.restrictedTerms ?? []),
  ];
}

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

const REASON_TEXT: Record<string, string> = {
  NO_REFERENCES: "cites no metric or finding",
  UNKNOWN_METRIC_CODE: "cites a metric that is not in this diagnostic",
  UNKNOWN_FINDING_ID: "cites a finding that is not in this diagnostic",
  UNSUPPORTED_NUMBER: "quotes a figure that is not in the diagnostic facts it rests on",
  RESTRICTED_LANGUAGE: "uses audit, credit-rating or insolvency wording",
};

type EditorValues = { summary: string; keyObservations: string; risks: string; limitations: string };

function editorValues(narrative: Narrative): EditorValues {
  return {
    summary: narrative.summary ?? "",
    keyObservations: (narrative.keyObservations ?? []).join("\n"),
    risks: (narrative.risks ?? []).join("\n"),
    limitations: (narrative.limitations ?? []).join("\n"),
  };
}

function NarrativeView({ narrative }: { narrative: Narrative }) {
  const sections: Array<[string, string[]]> = [
    ["Key observations", narrative.keyObservations ?? []],
    ["Risks", narrative.risks ?? []],
    ["Limitations", narrative.limitations ?? []],
  ];
  return (
    <>
      <p className="mt-3 whitespace-pre-line text-ink">{narrative.summary || "No summary."}</p>
      {sections.map(([heading, items]) =>
        items.length > 0 ? (
          <div key={heading}>
            <h3 className="mt-4 text-base text-ink">{heading}</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
              {items.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </>
  );
}

function NarrativeEditor(props: {
  path: string;
  current: Narrative;
  onSaved: () => Promise<void>;
}) {
  const { path, current, onSaved } = props;
  const [values, setValues] = useState<EditorValues>(() => editorValues(current));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function setField(field: keyof EditorValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setMessage(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const before = editorValues(current);
    const edits: Record<string, string | string[]> = {};
    if (values.summary.trim() !== before.summary.trim()) edits.summary = values.summary.trim();
    for (const field of ["keyObservations", "risks", "limitations"] as const) {
      const next = splitLines(values[field]);
      if (next.join("\n") !== splitLines(before[field]).join("\n")) edits[field] = next;
    }
    if (Object.keys(edits).length === 0) {
      setError("Nothing has been changed.");
      return;
    }
    if (edits.summary === "") {
      setError("The summary cannot be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { status, body } = await apiFetch<{ message?: string }>(path, {
        method: "POST",
        json: edits,
      });
      if (status >= 400) {
        setError(apiErrorMessage(body, "Unable to save the edit"));
        return;
      }
      await onSaved();
      setMessage("Edit saved. The original draft is kept alongside it.");
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = "mt-1 block w-full border border-line px-2 py-1";
  return (
    <form className="mt-4" onSubmit={onSubmit}>
      <label className="block text-sm text-ink">
        Summary
        <textarea
          className={fieldClass}
          rows={5}
          maxLength={4000}
          value={values.summary}
          onChange={(event) => setField("summary", event.target.value)}
        />
      </label>
      {(
        [
          ["keyObservations", "Key observations"],
          ["risks", "Risks"],
          ["limitations", "Limitations"],
        ] as const
      ).map(([field, label]) => (
        <label key={field} className="mt-3 block text-sm text-ink">
          {label} (one per line)
          <textarea
            className={fieldClass}
            rows={4}
            value={values[field]}
            onChange={(event) => setField(field, event.target.value)}
          />
        </label>
      ))}
      {error ? <p className="mt-3 text-sm text-copper">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-pine">{message}</p> : null}
      <button
        className="mt-3 rounded-full bg-pine px-4 py-1 text-paper disabled:opacity-50"
        type="submit"
        disabled={saving}
      >
        {saving ? "Saving…" : "Save edit"}
      </button>
    </form>
  );
}

export default function AiInterpretationPage() {
  const { orgId, runId } = useParams<{ orgId: string; runId: string }>();
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [role, setRole] = useState<MembershipRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canWrite = role ? roleHasPermission(role, "xray:write") : false;
  const pending = interpretation?.status === "QUEUED" || interpretation?.status === "RUNNING";

  const load = useCallback(async () => {
    const { status, body } = await apiFetch<{ run?: Interpretation; message?: string }>(
      `/organizations/${orgId}/ai/interpretations/${runId}`,
    );
    if (status >= 400 || !body.run) {
      setError(apiErrorMessage(body, "Unable to load the AI interpretation"));
      return;
    }
    setInterpretation(body.run);
    setError(null);
  }, [orgId, runId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch
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

  return (
    <>
      <SiteHeader mark="AI interpretation" />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.16em] text-pine">Opero X-Ray</p>
            <h1 className="mt-2 text-3xl text-ink">AI interpretation draft</h1>
            <p className="mt-2 text-muted">
              Status {interpretation?.status ?? "…"}
              {interpretation ? ` · provider ${interpretation.provider}` : ""}
              {interpretation?.model ? ` · ${interpretation.model}` : ""}
            </p>
          </div>
          <Link className="text-pine underline" href={`/organizations/${orgId}/ai`}>
            All interpretations
          </Link>
        </div>

        {error ? <p className="mb-4 text-sm text-copper">{error}</p> : null}
        {!interpretation && !error ? <p className="text-muted">Loading interpretation…</p> : null}

        {pending ? (
          <p className="mb-6 border border-line p-4 text-muted">
            The draft is being generated. This page refreshes automatically.
          </p>
        ) : null}

        {interpretation?.status === "UNAVAILABLE" ? (
          <section className="mb-6 border border-line p-4">
            <h2 className="text-lg text-copper">AI interpretation was unavailable</h2>
            <p className="mt-1 text-sm text-muted">
              {interpretation.failureMessage ?? "The AI provider could not be reached."} No draft
              was produced. The diagnostic and any report are unaffected; you can request a new
              interpretation later.
            </p>
          </section>
        ) : null}

        {interpretation?.status === "FAILED" ? (
          <section className="mb-6 border border-line p-4">
            <h2 className="text-lg text-copper">The interpretation failed</h2>
            <p className="mt-1 text-sm text-muted">
              {interpretation.failureMessage ?? "The provider did not return a usable draft."} No
              draft was stored.
            </p>
          </section>
        ) : null}

        {interpretation && version && current ? (
          <>
            {version.isSimulated ? (
              <p className="mb-6 border border-line p-4 text-sm text-copper">
                Simulated output: this text was assembled by fixed rules from the diagnostic
                results. No live AI model wrote it.
              </p>
            ) : null}

            <section className="mb-8 border border-line p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl text-ink">Draft narrative</h2>
                <p className="text-sm text-muted">
                  {version.editedNarrative ? "Edited by a reviewer" : "As generated"} · prompt{" "}
                  {interpretation.promptVersion}
                </p>
              </div>
              <NarrativeView narrative={current} />
              {version.editedNarrative ? (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer text-ink">Show the original draft</summary>
                  <NarrativeView narrative={version.narrative} />
                </details>
              ) : null}
            </section>

            <section className="mb-8">
              <h2 className="text-xl text-ink">Grounding check</h2>
              <p className="mt-1 text-sm text-muted">
                {version.groundedClaims.length} claim(s) rest on metrics or findings that exist in
                this diagnostic; {version.unsupportedClaims.length} statement(s) were flagged.
                {version.editedNarrative
                  ? " The check covers the generated draft, not reviewer edits."
                  : ""}
              </p>
              {version.unsupportedClaims.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {version.unsupportedClaims.map((claim, index) => (
                    <li key={`${index}-${claim.text}`} className="border border-line p-3 text-sm">
                      <p className="text-ink">{claim.text}</p>
                      <p className="mt-1 text-copper">
                        Unsupported:{" "}
                        {(claim.reasons ?? []).map((reason) => REASON_TEXT[reason] ?? reason).join("; ")}
                        {flaggedDetails(claim).length > 0
                          ? ` (${flaggedDetails(claim).join(", ")})`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className="mb-8 border border-line p-4">
              <h2 className="text-lg text-ink">Review and edit</h2>
              {canWrite ? (
                <>
                  <p className="mt-1 text-sm text-muted">
                    Edits are stored next to the generated draft and marked as reviewer-edited. A
                    report uses the text as it stands when the report version is created.
                  </p>
                  <NarrativeEditor
                    key={version.id}
                    path={`/organizations/${orgId}/ai/interpretations/${interpretation.id}/versions/${version.id}/edit`}
                    current={current}
                    onSaved={load}
                  />
                </>
              ) : (
                <p className="mt-1 text-sm text-muted">
                  View-only access: editing the draft requires Analyst or higher.
                </p>
              )}
            </section>
          </>
        ) : null}

        {interpretation ? (
          <section className="border border-line p-4 text-sm text-muted">
            <h2 className="text-base text-ink">Related</h2>
            <p className="mt-2">
              <Link
                className="mr-4 underline"
                href={`/organizations/${orgId}/diagnostics/${interpretation.diagnosticRunId}`}
              >
                Diagnostic run
              </Link>
              <Link
                className="underline"
                href={`/organizations/${orgId}/reports?run=${interpretation.diagnosticRunId}`}
              >
                Create a report for this run
              </Link>
            </p>
          </section>
        ) : null}
      </main>
    </>
  );
}
