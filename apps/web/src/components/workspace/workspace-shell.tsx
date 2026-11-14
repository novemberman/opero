"use client";

import {
  membershipRoleSchema,
  roleHasPermission,
  type MembershipRole,
  type Permission,
} from "@opero/shared";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiErrorMessage, apiFetch, resetCsrfToken } from "../../lib/api";
import { cn } from "../../lib/cn";
import { OperoLogo, OperoMark } from "../brand/opero-logo";
import { Alert, Breadcrumbs, Button, Skeleton, buttonClassName } from "../ui";
import { WORKSPACE_NAV, breadcrumbsForPath } from "./nav-config";

type OrgRow = {
  role: string;
  organization: { id: string; name: string; slug: string };
};

type AuthUser = { id: string; email: string; name: string };

const COLLAPSE_KEY = "opero.workspace.sidebarCollapsed";

function canAccess(role: MembershipRole | null, permission: Permission): boolean {
  return role ? roleHasPermission(role, permission) : false;
}

function SidebarBody({
  orgId,
  orgName,
  orgSlug,
  orgs,
  navItems,
  pathname,
  collapsed,
  onToggleCollapse,
  onNavigate,
  showCollapseControl,
}: {
  orgId: string;
  orgName: string;
  orgSlug: string;
  orgs: OrgRow[];
  navItems: typeof WORKSPACE_NAV;
  pathname: string;
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  showCollapseControl: boolean;
}) {
  const router = useRouter();

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex items-center gap-2 border-b border-border px-3 py-4",
          collapsed && "justify-center px-2",
        )}
      >
        <Link
          href={`/organizations/${orgId}`}
          className="no-underline"
          aria-label="Opero overview"
          onClick={onNavigate}
        >
          {collapsed ? <OperoMark className="size-8" /> : <OperoLogo markClassName="size-8" />}
        </Link>
      </div>

      <div className={cn("border-b border-border px-3 py-3", collapsed && "px-2")}>
        {collapsed ? (
          <p
            className="truncate text-center text-[10px] font-semibold uppercase tracking-wide text-text-secondary"
            title={orgName}
          >
            {orgName.slice(0, 1)}
          </p>
        ) : (
          <>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
              Workspace
            </label>
            <select
              className="mt-1.5 min-h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm font-medium text-navy"
              aria-label="Switch organization"
              value={orgId}
              onChange={(event) => {
                const next = event.target.value;
                if (next && next !== orgId) {
                  onNavigate?.();
                  router.push(`/organizations/${next}`);
                }
              }}
            >
              {orgs.map((row) => (
                <option key={row.organization.id} value={row.organization.id}>
                  {row.organization.name}
                </option>
              ))}
            </select>
            {orgSlug ? (
              <p className="mt-1 truncate font-data text-[11px] text-text-secondary">{orgSlug}</p>
            ) : null}
          </>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3" aria-label="Workspace">
        {navItems.map((item) => {
          const active = item.match(pathname, orgId);
          return (
            <Link
              key={item.id}
              href={item.href(orgId)}
              title={item.label}
              onClick={onNavigate}
              className={cn(
                "flex min-h-10 items-center rounded-lg text-sm font-medium no-underline transition-colors",
                collapsed ? "justify-center px-2" : "px-3",
                active
                  ? "bg-info-surface text-emerald"
                  : "text-text-secondary hover:bg-hover hover:text-navy",
              )}
              aria-current={active ? "page" : undefined}
            >
              {collapsed ? item.label.slice(0, 1) : item.label}
            </Link>
          );
        })}
      </nav>

      {showCollapseControl ? (
        <div className="border-t border-border p-2">
          <button
            type="button"
            className={cn(
              "flex min-h-10 w-full items-center rounded-lg text-sm font-medium text-text-secondary hover:bg-hover hover:text-navy",
              collapsed ? "justify-center px-2" : "px-3",
            )}
            onClick={onToggleCollapse}
            aria-pressed={collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "»" : "Collapse"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceShell({
  orgId,
  children,
}: {
  orgId: string;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<MembershipRole | null>(null);
  const [orgName, setOrgName] = useState<string>("Workspace");
  const [orgSlug, setOrgSlug] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const persistCollapsed = useCallback((next: boolean) => {
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgsRes, meRes, orgRes] = await Promise.all([
        apiFetch<{ organizations?: OrgRow[]; message?: string }>("/organizations"),
        apiFetch<{ user?: AuthUser; message?: string }>("/auth/me"),
        apiFetch<{ organization?: { name: string; slug: string }; message?: string }>(
          `/organizations/${orgId}`,
        ),
      ]);

      if (orgsRes.status === 401 || meRes.status === 401) {
        setError("Sign in required");
        setLoading(false);
        return;
      }
      if (orgRes.status === 403 || orgRes.status === 404) {
        setError(orgRes.body.message ?? "Organization not found or access denied");
        setLoading(false);
        return;
      }
      if (orgsRes.status >= 400) {
        setError(orgsRes.body.message ?? "Unable to load workspaces");
        setLoading(false);
        return;
      }

      const rows = orgsRes.body.organizations ?? [];
      setOrgs(rows);
      const membership = rows.find((row) => row.organization.id === orgId);
      const parsed = membership ? membershipRoleSchema.safeParse(membership.role) : null;
      setRole(parsed?.success ? parsed.data : null);
      setOrgName(orgRes.body.organization?.name ?? membership?.organization.name ?? "Workspace");
      setOrgSlug(orgRes.body.organization?.slug ?? membership?.organization.slug ?? "");
      if (meRes.status === 200 && meRes.body.user) setUser(meRes.body.user);
      else setUser(null);
    } catch {
      setError("Unable to reach Opero. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  const navItems = useMemo(
    () => WORKSPACE_NAV.filter((item) => canAccess(role, item.permission)),
    [role],
  );

  const crumbs = useMemo(
    () => breadcrumbsForPath(pathname, orgId, orgName),
    [pathname, orgId, orgName],
  );

  async function onSignOut() {
    setSigningOut(true);
    try {
      const { status, body } = await apiFetch<{ message?: string }>("/auth/logout", {
        method: "POST",
      });
      resetCsrfToken();
      if (status >= 400 && status !== 401) {
        setError(apiErrorMessage(body, "Unable to sign out"));
        return;
      }
      router.push("/login");
      router.refresh();
    } catch {
      setError("Unable to sign out");
    } finally {
      setSigningOut(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh bg-workspace">
        <aside className="hidden w-64 border-r border-border bg-surface md:block">
          <div className="space-y-3 p-4">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </aside>
        <div className="flex-1 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-6 h-40 w-full" />
        </div>
      </div>
    );
  }

  if (error && !role) {
    return (
      <div className="min-h-dvh bg-workspace px-5 py-12">
        <div className="mx-auto max-w-lg space-y-4">
          <OperoLogo />
          <Alert tone="error" title="Unable to open workspace">
            {error}
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Link href="/organizations" className={buttonClassName()}>
              Your organizations
            </Link>
            <Link href="/login" className={buttonClassName({ variant: "secondary" })}>
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-workspace text-text">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-r border-border bg-surface md:block",
          collapsed ? "w-[4.25rem]" : "w-64",
        )}
        data-collapsed={collapsed ? "true" : "false"}
        data-testid="workspace-sidebar"
      >
        <SidebarBody
          orgId={orgId}
          orgName={orgName}
          orgSlug={orgSlug}
          orgs={orgs}
          navItems={navItems}
          pathname={pathname}
          collapsed={collapsed}
          showCollapseControl
          onToggleCollapse={() => persistCollapsed(!collapsed)}
        />
      </aside>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          data-testid="mobile-nav-drawer"
        >
          <button
            type="button"
            className="absolute inset-0 bg-overlay"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-[min(100%,18rem)] flex-col bg-surface shadow-lg">
            <div className="flex items-center justify-end border-b border-border px-2 py-2">
              <Button variant="ghost" size="sm" onClick={() => setMobileOpen(false)}>
                Close
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SidebarBody
                orgId={orgId}
                orgName={orgName}
                orgSlug={orgSlug}
                orgs={orgs}
                navItems={navItems}
                pathname={pathname}
                collapsed={false}
                showCollapseControl={false}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur-sm sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-expanded={mobileOpen}
              data-testid="mobile-nav-open"
            >
              Menu
            </Button>
            <div className="min-w-0">
              <Breadcrumbs items={crumbs} />
              {role ? (
                <p className="mt-0.5 truncate text-[11px] text-text-secondary">Role · {role}</p>
              ) : null}
            </div>
          </div>

          <div className="relative flex shrink-0 items-center gap-2">
            <Link
              href="/organizations"
              className="hidden text-sm font-medium text-text-secondary no-underline hover:text-navy sm:inline"
            >
              All orgs
            </Link>
            <button
              type="button"
              className="inline-flex min-h-9 max-w-[10rem] items-center gap-2 rounded-full border border-border px-3 text-sm font-medium text-navy hover:bg-hover sm:max-w-[14rem]"
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
              onClick={() => setUserMenuOpen((open) => !open)}
            >
              <span className="truncate">{user?.name ?? "Account"}</span>
            </button>
            {userMenuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-border bg-surface p-2 shadow-md"
              >
                {user?.email ? (
                  <p className="truncate px-2 py-1.5 text-xs text-text-secondary">{user.email}</p>
                ) : null}
                <Link
                  role="menuitem"
                  href="/organizations"
                  className="block rounded-lg px-2 py-2 text-sm text-navy no-underline hover:bg-hover"
                >
                  Switch organization
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full rounded-lg px-2 py-2 text-left text-sm text-navy hover:bg-hover disabled:opacity-60"
                  onClick={() => void onSignOut()}
                  disabled={signingOut}
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="border-b border-border px-4 py-2 sm:px-6">
            <Alert tone="warning" title="Workspace notice">
              {error}
            </Alert>
          </div>
        ) : null}

        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
