"use client";

import Link from "next/link";
import {
  readinessIssueAction,
  type ReadinessIssueInput,
} from "../../lib/readiness-presentation";
import { Badge, Card, CardHeader, EmptyState, buttonClassName } from "../ui";

function severityTone(severity: string): "neutral" | "success" | "warning" | "error" | "info" {
  if (severity === "CRITICAL" || severity === "HIGH") return "error";
  if (severity === "MEDIUM") return "warning";
  if (severity === "LOW" || severity === "INFO") return "info";
  return "neutral";
}

export function ReadinessIssues({
  issues,
  orgId,
  documentIds,
  diagnosticRunId,
}: {
  issues: ReadinessIssueInput[];
  orgId: string;
  documentIds: string[];
  diagnosticRunId: string | null;
}) {
  return (
    <Card data-testid="readiness-issues">
      <CardHeader
        title="Quality, evidence & required actions"
        description="Blockers link to existing review workflows. Readiness never invents a decision beyond the assessment payload."
      />

      {issues.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No issues found" description="The latest assessment reported a clean checklist." />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {issues.map((issue) => {
            const action = readinessIssueAction(issue, {
              orgId,
              documentIds,
              diagnosticRunId,
            });
            return (
              <li
                key={issue.code}
                className="rounded-xl border border-border bg-workspace p-4"
                data-issue-code={issue.code}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={severityTone(issue.severity)}>{issue.severity}</Badge>
                  {issue.blocking ? <Badge tone="error">Blocking</Badge> : null}
                </div>
                <h3 className="mt-2 text-base font-semibold text-navy">{issue.title}</h3>
                <p className="mt-1 text-sm text-text-secondary">{issue.detail}</p>
                {action ? (
                  <div className="mt-3">
                    <p className="text-xs text-text-secondary">{action.reason}</p>
                    <Link
                      href={action.href}
                      className={buttonClassName({
                        variant: issue.blocking ? "primary" : "secondary",
                        size: "sm",
                        className: "mt-2",
                      })}
                    >
                      {action.label}
                    </Link>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
