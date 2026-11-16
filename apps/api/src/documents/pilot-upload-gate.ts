import { BadRequestException, ForbiddenException } from "@nestjs/common";

export type PilotUploadGateInput = {
  organizationId: string;
  emergencyDisableUploads: boolean;
  pilotUploadEnabled: boolean;
  pilotUploadOrgId?: string;
  pilotUploadExpiresAt?: string;
  /** Injectable clock for tests; defaults to server now. */
  now?: Date;
};

/**
 * Upload initiation + completion gate (createUpload and completeUpload).
 * 1) EMERGENCY_DISABLE_UPLOADS always wins.
 * 2) When PILOT_UPLOAD_ENABLED is true, only the allowlisted org may upload before expiry.
 * 3) When PILOT_UPLOAD_ENABLED is false, callers rely on emergency + auth only
 *    (staging/dev). Production boot forbids emergency=false without the pilot window.
 * Reject before quarantine putObject / worker enqueue so denied completions leave no objects.
 */
export function assertPilotUploadAllowed(input: PilotUploadGateInput): void {
  if (input.emergencyDisableUploads) {
    throw new BadRequestException({
      message: "Document uploads are temporarily disabled by the operator.",
      code: "EMERGENCY_DISABLE_UPLOADS",
    });
  }

  if (!input.pilotUploadEnabled) {
    return;
  }

  const orgId = input.pilotUploadOrgId?.trim();
  const expiresAtRaw = input.pilotUploadExpiresAt?.trim();
  if (!orgId || !expiresAtRaw) {
    throw new BadRequestException({
      message: "Pilot upload window is not configured.",
      code: "PILOT_UPLOAD_NOT_CONFIGURED",
    });
  }

  const expiresAt = new Date(expiresAtRaw);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new BadRequestException({
      message: "Pilot upload window expiry is invalid.",
      code: "PILOT_UPLOAD_NOT_CONFIGURED",
    });
  }

  const now = input.now ?? new Date();
  if (expiresAt.getTime() <= now.getTime()) {
    throw new BadRequestException({
      message: "Pilot upload window has expired.",
      code: "PILOT_UPLOAD_EXPIRED",
    });
  }

  if (input.organizationId !== orgId) {
    throw new ForbiddenException({
      message: "Uploads are not authorized for this organization during the pilot window.",
      code: "PILOT_UPLOAD_FORBIDDEN",
    });
  }
}

export function pilotUploadWindowOpen(input: {
  emergencyDisableUploads: boolean;
  pilotUploadEnabled: boolean;
  pilotUploadOrgId?: string;
  pilotUploadExpiresAt?: string;
  now?: Date;
}): boolean {
  if (input.emergencyDisableUploads || !input.pilotUploadEnabled) return false;
  if (!input.pilotUploadOrgId?.trim() || !input.pilotUploadExpiresAt?.trim()) return false;
  const expiresAt = new Date(input.pilotUploadExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt.getTime() > (input.now ?? new Date()).getTime();
}
