import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  classifyPublicationFailure,
  denyPublicationAndThrow,
  extractHttpFailureCode,
} from "./publication-audit";

describe("publication-audit helpers", () => {
  it("classifies known failure codes", () => {
    expect(classifyPublicationFailure("CRITICAL_GROUNDING_VIOLATIONS")).toBe("GROUNDING");
    expect(classifyPublicationFailure("READINESS_BLOCKED")).toBe("READINESS");
    expect(classifyPublicationFailure("CRITICAL_RECONCILIATIONS_OPEN")).toBe(
      "RECONCILIATION",
    );
    expect(classifyPublicationFailure("APPROVAL_NOT_RECORDED")).toBe("APPROVAL");
    expect(classifyPublicationFailure("PUBLISHED_PDF_CORRUPT")).toBe("INTEGRITY");
    expect(classifyPublicationFailure("INVALID_STATE")).toBe("STATE");
    expect(classifyPublicationFailure("MISSING_PERMISSION")).toBe("PERMISSION");
  });

  it("extracts codes from Nest HTTP exceptions", () => {
    expect(
      extractHttpFailureCode(
        new ConflictException({ message: "blocked", code: "CRITICAL_GROUNDING_VIOLATIONS" }),
      ),
    ).toBe("CRITICAL_GROUNDING_VIOLATIONS");
    expect(extractHttpFailureCode(new ForbiddenException("nope"))).toBe("MISSING_PERMISSION");
    expect(
      extractHttpFailureCode(
        new ConflictException("Report is already published and immutable; create a new version"),
      ),
    ).toBe("ALREADY_PUBLISHED");
  });

  it("does not audit NotFound as a publication denial", async () => {
    const prisma = { auditEvent: { findFirst: vi.fn() } };
    const audit = { record: vi.fn() };
    const missing = new NotFoundException("Report not found");
    await expect(
      denyPublicationAndThrow(prisma as never, audit as never, {
        organizationId: "org",
        actorUserId: "user",
        reportId: "report",
        requestedAction: "approve",
        error: missing,
      }),
    ).rejects.toBe(missing);
    expect(prisma.auditEvent.findFirst).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
