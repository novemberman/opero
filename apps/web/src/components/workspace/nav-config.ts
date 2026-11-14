import type { Permission } from "@opero/shared";

export type WorkspaceNavItem = {
  id: string;
  label: string;
  href: (orgId: string) => string;
  permission: Permission;
  match: (pathname: string, orgId: string) => boolean;
};

export const WORKSPACE_NAV: WorkspaceNavItem[] = [
  {
    id: "overview",
    label: "Overview",
    href: (orgId) => `/organizations/${orgId}`,
    permission: "org:read",
    match: (pathname, orgId) => pathname === `/organizations/${orgId}`,
  },
  {
    id: "documents",
    label: "Documents",
    href: (orgId) => `/organizations/${orgId}/documents`,
    permission: "xray:read",
    match: (pathname, orgId) => pathname.startsWith(`/organizations/${orgId}/documents`),
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    href: (orgId) => `/organizations/${orgId}/diagnostics`,
    permission: "xray:read",
    match: (pathname, orgId) => pathname.startsWith(`/organizations/${orgId}/diagnostics`),
  },
  {
    id: "readiness",
    label: "Readiness",
    href: (orgId) => `/organizations/${orgId}/readiness`,
    permission: "xray:read",
    match: (pathname, orgId) => pathname.startsWith(`/organizations/${orgId}/readiness`),
  },
  {
    id: "reconciliations",
    label: "Reconciliations",
    href: (orgId) => `/organizations/${orgId}/reconciliations`,
    permission: "xray:read",
    match: (pathname, orgId) => pathname.startsWith(`/organizations/${orgId}/reconciliations`),
  },
  {
    id: "ai",
    label: "AI interpretation",
    href: (orgId) => `/organizations/${orgId}/ai`,
    permission: "xray:read",
    match: (pathname, orgId) => pathname.startsWith(`/organizations/${orgId}/ai`),
  },
  {
    id: "reports",
    label: "Reports",
    href: (orgId) => `/organizations/${orgId}/reports`,
    permission: "xray:read",
    match: (pathname, orgId) => pathname.startsWith(`/organizations/${orgId}/reports`),
  },
  {
    id: "billing",
    label: "Billing",
    href: (orgId) => `/organizations/${orgId}/billing`,
    permission: "billing:read",
    match: (pathname, orgId) => pathname.startsWith(`/organizations/${orgId}/billing`),
  },
  {
    id: "members",
    label: "Members",
    href: (orgId) => `/organizations/${orgId}/members`,
    permission: "org:read",
    match: (pathname, orgId) => pathname.startsWith(`/organizations/${orgId}/members`),
  },
  {
    id: "settings",
    label: "Settings",
    href: (orgId) => `/organizations/${orgId}/settings`,
    permission: "org:read",
    match: (pathname, orgId) => pathname.startsWith(`/organizations/${orgId}/settings`),
  },
];

export function breadcrumbsForPath(pathname: string, orgId: string, orgName: string) {
  const base = { label: orgName, href: `/organizations/${orgId}` };
  const item = WORKSPACE_NAV.find((nav) => nav.id !== "overview" && nav.match(pathname, orgId));
  if (!item) return [base];
  return [base, { label: item.label, href: item.href(orgId) }];
}
