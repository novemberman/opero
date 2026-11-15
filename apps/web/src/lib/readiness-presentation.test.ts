import { describe, expect, it } from "vitest";
import {
  groupChecklist,
  readinessIssueAction,
  readinessStatusPresentation,
} from "./readiness-presentation";

describe("readiness-presentation", () => {
  it("maps readiness statuses to decision-support copy", () => {
    expect(readinessStatusPresentation("BLOCKED").tone).toBe("error");
    expect(readinessStatusPresentation("READY").headline).toMatch(/ready/i);
  });

  it("links blockers to existing review workflows", () => {
    const pending = readinessIssueAction(
      {
        code: "PENDING_REVIEWS",
        severity: "MEDIUM",
        title: "Pending extraction reviews",
        detail: "3 pending",
        blocking: false,
      },
      { orgId: "org1", documentIds: ["doc1"], diagnosticRunId: "run1" },
    );
    expect(pending?.href).toBe("/organizations/org1/documents/doc1");

    const conflicts = readinessIssueAction(
      {
        code: "CRITICAL_RECONCILIATIONS",
        severity: "CRITICAL",
        title: "Unresolved critical evidence conflicts",
        detail: "1 open",
        blocking: true,
      },
      { orgId: "org1", documentIds: ["doc1"], diagnosticRunId: "run1" },
    );
    expect(conflicts?.href).toContain("/reconciliations?run=run1");
  });

  it("groups checklist required vs recommended failures", () => {
    const groups = groupChecklist([
      { id: "a", required: true, passed: false },
      { id: "b", required: true, passed: true },
      { id: "c", required: false, passed: false },
    ]);
    expect(groups.requiredFailed).toHaveLength(1);
    expect(groups.optionalFailed).toHaveLength(1);
  });
});
