"use client";

import { consolidationScopeSchema, periodTypeSchema } from "@opero/shared";
import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage, apiFetch } from "../lib/api";
import {
  metadataChanges,
  metadataFormValues,
  type MetadataFormValues,
  type StatementMetadataValues,
} from "../lib/xray";

type Metadata = StatementMetadataValues & {
  statementId: string;
  statementType: string;
  confirmedAt: string | null;
};

type HistoryEntry = {
  id: string;
  previousValues: Record<string, unknown>;
  nextValues: Record<string, unknown>;
  note: string | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
};

const FIELD_LABELS: Record<string, string> = {
  periodType: "Period type",
  fiscalYearEndMonth: "Fiscal year end month",
  consolidationScope: "Consolidation scope",
  entityName: "Entity name",
  currency: "Currency",
  periodStart: "Period start",
  periodEnd: "Period end",
  periodLabel: "Period label",
};

function show(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

/** One line per changed field, plus any change of the confirmation state. */
function describeChange(entry: HistoryEntry): string[] {
  const lines = Object.keys(entry.nextValues)
    .filter((field) => field !== "confirmed")
    .map(
      (field) =>
        `${FIELD_LABELS[field] ?? field}: ${show(entry.previousValues[field])} → ${show(
          entry.nextValues[field],
        )}`,
    );
  const before = entry.previousValues.confirmed === true;
  const after = entry.nextValues.confirmed === true;
  if (after && !before) lines.push("Metadata confirmed");
  if (after && before && lines.length === 0) lines.push("Metadata confirmed again");
  if (!after && before) lines.push("Confirmation withdrawn by this edit");
  return lines;
}

/**
 * Review and correction of one statement's period, currency and entity
 * metadata, with its change history.
 */
export function StatementMetadataPanel(props: {
  orgId: string;
  statementId: string;
  statementType: string;
  canWrite: boolean;
}) {
  const { orgId, statementId, statementType, canWrite } = props;
  const path = `/organizations/${orgId}/statements/${statementId}/metadata`;

  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [form, setForm] = useState<MetadataFormValues | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { status, body } = await apiFetch<{
      metadata?: Metadata;
      history?: HistoryEntry[];
      message?: string;
    }>(path);
    if (status >= 400 || !body.metadata) {
      setError(apiErrorMessage(body, "Unable to load statement metadata"));
      return;
    }
    setMetadata(body.metadata);
    setHistory(body.history ?? []);
    setForm(metadataFormValues(body.metadata));
    setError(null);
  }, [path]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch
    void load();
  }, [load]);

  function setField(field: keyof MetadataFormValues, value: string) {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
    setMessage(null);
  }

  async function save(confirm: boolean) {
    if (!canWrite || !metadata || !form) return;
    const changes = metadataChanges(metadata, form);
    if (Object.keys(changes).length === 0 && !confirm) {
      setError("Nothing has been changed.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const { status, body } = await apiFetch<{ message?: string }>(path, {
        method: "PATCH",
        json: {
          ...changes,
          ...(confirm ? { confirm: true } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      if (status >= 400) {
        setError(apiErrorMessage(body, "Unable to save metadata"));
        return;
      }
      setNote("");
      await load();
      setMessage(confirm ? "Metadata confirmed" : "Metadata saved");
    } finally {
      setSaving(false);
    }
  }

  const dirty = metadata && form ? Object.keys(metadataChanges(metadata, form)).length > 0 : false;
  const inputClass = "mt-1 block w-full border border-line px-2 py-1 disabled:opacity-60";

  return (
    <li className="border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg text-ink">{statementType}</h3>
        {metadata ? (
          <p className={`text-sm ${metadata.confirmedAt ? "text-pine" : "text-copper"}`}>
            {metadata.confirmedAt
              ? `Confirmed ${new Date(metadata.confirmedAt).toLocaleString()}`
              : "Not confirmed"}
          </p>
        ) : null}
      </div>

      {!form && !error ? <p className="mt-2 text-sm text-muted">Loading metadata…</p> : null}

      {form ? (
        <form
          className="mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save(false);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-ink">
              Period type
              <select
                className={inputClass}
                value={form.periodType}
                disabled={!canWrite}
                onChange={(event) => setField("periodType", event.target.value)}
              >
                {periodTypeSchema.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ink">
              Consolidation scope
              <select
                className={inputClass}
                value={form.consolidationScope}
                disabled={!canWrite}
                onChange={(event) => setField("consolidationScope", event.target.value)}
              >
                {consolidationScopeSchema.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ink">
              Period start
              <input
                className={inputClass}
                type="date"
                value={form.periodStart}
                disabled={!canWrite}
                onChange={(event) => setField("periodStart", event.target.value)}
              />
            </label>
            <label className="text-sm text-ink">
              Period end
              <input
                className={inputClass}
                type="date"
                value={form.periodEnd}
                disabled={!canWrite}
                onChange={(event) => setField("periodEnd", event.target.value)}
              />
            </label>
            <label className="text-sm text-ink">
              Period label
              <input
                className={inputClass}
                maxLength={64}
                value={form.periodLabel}
                disabled={!canWrite}
                onChange={(event) => setField("periodLabel", event.target.value)}
              />
            </label>
            <label className="text-sm text-ink">
              Currency (ISO code)
              <input
                className={inputClass}
                maxLength={3}
                value={form.currency}
                disabled={!canWrite}
                onChange={(event) => setField("currency", event.target.value.toUpperCase())}
              />
            </label>
            <label className="text-sm text-ink">
              Fiscal year end month
              <select
                className={inputClass}
                value={form.fiscalYearEndMonth}
                disabled={!canWrite}
                onChange={(event) => setField("fiscalYearEndMonth", event.target.value)}
              >
                <option value="">Not set</option>
                {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ink">
              Entity name
              <input
                className={inputClass}
                maxLength={200}
                value={form.entityName}
                disabled={!canWrite}
                onChange={(event) => setField("entityName", event.target.value)}
              />
            </label>
          </div>

          {canWrite ? (
            <>
              <label className="mt-3 block text-sm text-ink">
                Note for the history (optional)
                <input
                  className={inputClass}
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-line px-4 py-1 text-ink disabled:opacity-50"
                  type="submit"
                  disabled={saving || !dirty}
                >
                  Save changes
                </button>
                <button
                  className="rounded-full bg-pine px-4 py-1 text-paper disabled:opacity-50"
                  type="button"
                  disabled={saving}
                  onClick={() => void save(true)}
                >
                  {dirty ? "Save and confirm" : "Confirm metadata"}
                </button>
              </div>
              {metadata?.confirmedAt ? (
                <p className="mt-2 text-sm text-muted">
                  Saving a change without confirming withdraws the current confirmation.
                </p>
              ) : null}
            </>
          ) : null}
        </form>
      ) : null}

      {error ? <p className="mt-3 text-sm text-copper">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-pine">{message}</p> : null}

      {metadata ? (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-ink">Change history ({history.length})</summary>
          <ul className="mt-2 space-y-2">
            {history.map((entry) => (
              <li key={entry.id} className="border-l border-line pl-3 text-muted">
                <p>
                  {new Date(entry.createdAt).toLocaleString()} ·{" "}
                  {entry.actor?.name ?? "Unknown user"}
                </p>
                {describeChange(entry).map((line) => (
                  <p key={line} className="text-ink">
                    {line}
                  </p>
                ))}
                {entry.note ? <p>Note: {entry.note}</p> : null}
              </li>
            ))}
            {history.length === 0 ? (
              <li className="text-muted">No corrections or confirmations recorded.</li>
            ) : null}
          </ul>
        </details>
      ) : null}
    </li>
  );
}
