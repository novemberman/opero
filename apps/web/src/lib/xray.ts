import { membershipRoleSchema, type MembershipRole } from "@opero/shared";
import { apiFetch } from "./api";

/** The signed-in user's role in the organization, or null when not a member. */
export async function fetchOrgRole(orgId: string): Promise<MembershipRole | null> {
  const { status, body } = await apiFetch<{
    organizations?: Array<{ role: string; organization: { id: string } }>;
  }>("/organizations");
  if (status >= 400 || !body) return null;
  const membership = body.organizations?.find((row) => row.organization.id === orgId);
  const parsed = membership ? membershipRoleSchema.safeParse(membership.role) : null;
  return parsed?.success ? parsed.data : null;
}

export type DiagnosticRunOption = {
  id: string;
  status: string;
  periodLabel: string | null;
  createdAt: string;
};

/** Completed diagnostic runs, newest first, for scope selectors. */
export async function fetchSucceededRuns(orgId: string): Promise<DiagnosticRunOption[]> {
  const { status, body } = await apiFetch<{ runs?: DiagnosticRunOption[] }>(
    `/organizations/${orgId}/diagnostics`,
  );
  if (status >= 400 || !body) return [];
  return (body.runs ?? []).filter((run) => run.status === "SUCCEEDED");
}

export function runLabel(run: DiagnosticRunOption): string {
  const period = run.periodLabel ? ` · ${run.periodLabel}` : "";
  return `Run ${run.id.slice(0, 8)}…${period} · ${new Date(run.createdAt).toLocaleString()}`;
}

export type InterpretationOption = { versionId: string; label: string };

/** Completed AI interpretations of a diagnostic run that a report can attach. */
export async function fetchInterpretationOptions(
  orgId: string,
  diagnosticRunId: string,
): Promise<InterpretationOption[]> {
  const { status, body } = await apiFetch<{
    runs?: Array<{
      status: string;
      provider: string;
      createdAt: string;
      versions: Array<{ id: string; isSimulated: boolean; editedByUserId: string | null }>;
    }>;
  }>(`/organizations/${orgId}/ai/interpretations?diagnosticRunId=${diagnosticRunId}`);
  if (status >= 400 || !body) return [];
  return (body.runs ?? []).flatMap((run) => {
    const latest = run.versions[0];
    if (run.status !== "SUCCEEDED" || !latest) return [];
    const flags = `${latest.isSimulated ? " (simulated)" : ""}${latest.editedByUserId ? " · edited" : ""}`;
    return [
      {
        versionId: latest.id,
        label: `${run.provider}${flags} · ${new Date(run.createdAt).toLocaleString()}`,
      },
    ];
  });
}

/** One entry per non-empty line, trimmed. Used for list fields edited as text. */
export function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export type MetadataFormValues = {
  periodType: string;
  fiscalYearEndMonth: string;
  consolidationScope: string;
  entityName: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
};

export type StatementMetadataValues = {
  periodType: string;
  fiscalYearEndMonth: number | null;
  consolidationScope: string;
  entityName: string | null;
  currency: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  periodLabel: string | null;
};

export function metadataFormValues(metadata: StatementMetadataValues): MetadataFormValues {
  return {
    periodType: metadata.periodType,
    fiscalYearEndMonth:
      metadata.fiscalYearEndMonth === null ? "" : String(metadata.fiscalYearEndMonth),
    consolidationScope: metadata.consolidationScope,
    entityName: metadata.entityName ?? "",
    currency: metadata.currency ?? "",
    periodStart: metadata.periodStart ?? "",
    periodEnd: metadata.periodEnd ?? "",
    periodLabel: metadata.periodLabel ?? "",
  };
}

/**
 * The fields of a metadata form that differ from the stored values, in the
 * shape the API expects. Cleared optional fields are sent as null.
 */
export function metadataChanges(
  stored: StatementMetadataValues,
  form: MetadataFormValues,
): Partial<StatementMetadataValues> {
  const text = (value: string) => (value.trim() === "" ? null : value.trim());
  const month = form.fiscalYearEndMonth.trim();
  const next: StatementMetadataValues = {
    periodType: form.periodType,
    fiscalYearEndMonth: month === "" ? null : Number(month),
    consolidationScope: form.consolidationScope,
    entityName: text(form.entityName),
    currency: text(form.currency)?.toUpperCase() ?? null,
    periodStart: text(form.periodStart),
    periodEnd: text(form.periodEnd),
    periodLabel: text(form.periodLabel),
  };
  const changes: Partial<StatementMetadataValues> = {};
  for (const key of Object.keys(next) as Array<keyof StatementMetadataValues>) {
    if (next[key] !== stored[key]) {
      (changes as Record<string, unknown>)[key] = next[key];
    }
  }
  return changes;
}

/** Offers a downloaded blob to the browser as a file. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
