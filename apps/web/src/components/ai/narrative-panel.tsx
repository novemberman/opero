"use client";

import { FormEvent, useState } from "react";
import { apiErrorMessage, apiFetch } from "../../lib/api";
import { splitLines } from "../../lib/xray";
import { Alert, Badge, Button, Card, CardHeader } from "../ui";

export type Narrative = {
  summary?: string;
  keyObservations?: string[];
  risks?: string[];
  limitations?: string[];
};

export function NarrativeView({ narrative }: { narrative: Narrative }) {
  const sections: Array<[string, string[]]> = [
    ["Key observations", narrative.keyObservations ?? []],
    ["Risks", narrative.risks ?? []],
    ["Limitations", narrative.limitations ?? []],
  ];
  return (
    <div data-testid="narrative-view">
      <p className="mt-3 whitespace-pre-line text-navy">{narrative.summary || "No summary."}</p>
      {sections.map(([heading, items]) =>
        items.length > 0 ? (
          <div key={heading}>
            <h3 className="mt-4 text-base font-semibold text-navy">{heading}</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-text-secondary">
              {items.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </div>
  );
}

type EditorValues = {
  summary: string;
  keyObservations: string;
  risks: string;
  limitations: string;
};

function editorValues(narrative: Narrative): EditorValues {
  return {
    summary: narrative.summary ?? "",
    keyObservations: (narrative.keyObservations ?? []).join("\n"),
    risks: (narrative.risks ?? []).join("\n"),
    limitations: (narrative.limitations ?? []).join("\n"),
  };
}

export function NarrativeEditor(props: {
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

  return (
    <form className="mt-4 space-y-3" onSubmit={onSubmit} data-testid="narrative-editor">
      <label className="block text-sm font-medium text-navy">
        Summary
        <textarea
          className="mt-1 block w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
        <label key={field} className="block text-sm font-medium text-navy">
          {label} (one per line)
          <textarea
            className="mt-1 block w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            rows={4}
            value={values[field]}
            onChange={(event) => setField(field, event.target.value)}
          />
        </label>
      ))}
      {error ? (
        <Alert tone="error" title="Edit not saved">
          {error}
        </Alert>
      ) : null}
      {message ? (
        <Alert tone="success" title="Saved">
          {message}
        </Alert>
      ) : null}
      <Button type="submit" loading={saving} disabled={saving}>
        {saving ? "Saving…" : "Save human review edit"}
      </Button>
    </form>
  );
}

export function NarrativePanel({
  narrative,
  original,
  isSimulated,
  isEdited,
  promptVersion,
}: {
  narrative: Narrative;
  original?: Narrative | null;
  isSimulated: boolean;
  isEdited: boolean;
  promptVersion: string;
}) {
  return (
    <Card data-testid="narrative-panel">
      <CardHeader
        title="AI-generated interpretation"
        description="Draft narrative over deterministic diagnostic outputs. Not a source of new financial figures."
        action={
          <div className="flex flex-wrap gap-2">
            {isSimulated ? <Badge tone="warning">Simulated</Badge> : <Badge tone="info">AI draft</Badge>}
            {isEdited ? <Badge tone="success">Human-reviewed</Badge> : null}
          </div>
        }
      />
      {isSimulated ? (
        <div className="mt-4">
          <Alert tone="warning" title="Simulated output">
            This text was assembled by fixed rules from diagnostic results. No live AI model wrote
            it. Do not present it as production model intelligence.
          </Alert>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-text-secondary">Prompt {promptVersion}</p>
      <NarrativeView narrative={narrative} />
      {original && isEdited ? (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold text-navy">Show original AI draft</summary>
          <NarrativeView narrative={original} />
        </details>
      ) : null}
    </Card>
  );
}
