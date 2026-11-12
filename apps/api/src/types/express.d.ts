import type { MembershipRole } from "@opero/shared";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: Date | null;
};

export type RequestMembership = {
  id: string;
  organizationId: string;
  userId: string;
  role: MembershipRole;
};

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: AuthenticatedUser;
      sessionId?: string;
      membership?: RequestMembership;
    }
  }
}

export {};
