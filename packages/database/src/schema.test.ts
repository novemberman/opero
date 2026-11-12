import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { membershipRoles } from "@opero/shared";

const schema = readFileSync(
  resolve(import.meta.dirname, "../prisma/schema.prisma"),
  "utf8",
);

describe("prisma schema", () => {
  it("uses PostgreSQL and the Prisma 7 client generator", () => {
    expect(schema).toContain('provider = "postgresql"');
    expect(schema).toContain('provider     = "prisma-client"');
    expect(schema).toContain('output       = "../generated/prisma"');
  });

  it("defines the foundation models with uuid keys and timestamps", () => {
    for (const model of ["Organization", "User", "Membership", "AuditEvent"]) {
      expect(schema).toContain(`model ${model} {`);
    }

    expect(schema).toContain("@db.Uuid");
    expect(schema).toContain("@default(uuid())");
    expect(schema).toContain("@default(now())");
    expect(schema).toContain("@updatedAt");
  });

  it("keeps MembershipRole aligned with the shared contract", () => {
    expect(schema).toContain("enum MembershipRole {");
    for (const role of membershipRoles) {
      expect(schema).toMatch(new RegExp(`\\b${role}\\b`));
    }
  });

  it("scopes membership and audit records to an organization", () => {
    expect(schema).toMatch(/slug\s+String\s+@unique/);
    expect(schema).toMatch(/email\s+String\s+@unique/);
    expect(schema).toContain("@@unique([organizationId, userId])");
    expect(schema).toContain("@@index([organizationId, createdAt])");
    expect(schema).toContain("onDelete: Restrict");
  });

  it("adds auth session invitation and credential fields", () => {
    for (const model of [
      "Session",
      "EmailVerificationToken",
      "PasswordResetToken",
      "OrganizationInvitation",
    ]) {
      expect(schema).toContain(`model ${model} {`);
    }
    expect(schema).toContain("passwordHash");
    expect(schema).toContain("emailVerifiedAt");
    expect(schema).toContain("tokenHash");
    expect(schema).not.toContain("MEMBER");
  });

  it("documents that tenant isolation is a service-layer responsibility", () => {
    expect(schema).toMatch(/Tenant isolation is not enforced by this schema/);
    expect(schema).toMatch(/organizationId/);
    expect(schema).toMatch(/Postgres RLS is not enabled/);
  });

  it("defines Phase 4 document and financial evidence models", () => {
    for (const model of [
      "Document",
      "DocumentVersion",
      "DocumentUpload",
      "DocumentProcessingJob",
      "DocumentExtraction",
      "FinancialStatement",
      "FinancialLineItem",
      "EvidenceReference",
      "ExtractionReview",
      "DocumentAccessEvent",
    ]) {
      expect(schema).toContain(`model ${model} {`);
    }
    expect(schema).toMatch(/Raw financial documents are never stored in PostgreSQL/);
  });
});

