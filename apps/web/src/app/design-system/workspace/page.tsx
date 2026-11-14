"use client";

import Link from "next/link";
import { useState } from "react";
import { OperoLogo, OperoMark } from "../../../components/brand/opero-logo";
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  EmptyState,
  buttonClassName,
} from "../../../components/ui";
import { cn } from "../../../lib/cn";

const nav = [
  "Overview",
  "Documents",
  "Diagnostics",
  "Readiness",
  "Reconciliations",
  "AI interpretation",
  "Reports",
  "Billing",
  "Members",
  "Settings",
] as const;

function FixtureSidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className={cn(
        "flex h-[640px] flex-col border border-border bg-surface",
        collapsed ? "w-[4.25rem]" : "w-64",
      )}
      data-testid={collapsed ? "fixture-sidebar-collapsed" : "fixture-sidebar-expanded"}
    >
      <div className={cn("border-b border-border px-3 py-4", collapsed && "flex justify-center")}>
        {collapsed ? <OperoMark className="size-8" /> : <OperoLogo markClassName="size-8" />}
      </div>
      {!collapsed ? (
        <div className="border-b border-border px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
            Workspace
          </p>
          <p className="mt-1 text-sm font-semibold text-navy">Netshift Digital Ltd</p>
          <p className="font-data text-[11px] text-text-secondary">netshift-demo</p>
        </div>
      ) : null}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {nav.map((label, index) => (
          <div
            key={label}
            className={cn(
              "flex min-h-10 items-center rounded-lg text-sm font-medium",
              collapsed ? "justify-center px-2" : "px-3",
              index === 0 ? "bg-info-surface text-emerald" : "text-text-secondary",
            )}
          >
            {collapsed ? label.slice(0, 1) : label}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function FixtureDashboard({ empty }: { empty?: boolean }) {
  if (empty) {
    return (
      <div className="space-y-4" data-testid="fixture-dashboard-empty">
        <h1 className="text-3xl text-navy">Netshift Digital Ltd</h1>
        <EmptyState
          title="No financial activity yet"
          description="Upload a statement to begin extraction, review and diagnostics."
          action={<span className={buttonClassName({ size: "sm" })}>Upload statement</span>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="fixture-dashboard-populated">
      <Alert tone="info" title="Fixture preview">
        Sample workspace data for visual review — not live tenant data.
      </Alert>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald">
          Workspace overview
        </p>
        <h1 className="mt-2 text-3xl text-navy">Netshift Digital Ltd</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Latest diagnostic", "FY2024 · SUCCEEDED"],
          ["Business Health Score", "72"],
          ["Statement coverage", "3 ready · 1 review"],
          ["Report readiness", "1 published · 1 draft"],
        ].map(([label, value]) => (
          <Card key={label} className="!p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
              {label}
            </p>
            <p className="mt-2 font-data text-xl font-semibold text-navy">{value}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="font-semibold text-navy">Action centre</p>
          <ul className="mt-3 space-y-2 text-sm text-text-secondary">
            <li className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
              Review extracted figures <Badge tone="emerald">Next</Badge>
            </li>
            <li className="rounded-xl border border-border px-3 py-2">Run available diagnostics</li>
          </ul>
        </Card>
        <Card>
          <p className="font-semibold text-navy">Recent documents</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex justify-between gap-2">
              <span>Netshift-FY2024.pdf</span>
              <Badge tone="warning">REVIEW_REQUIRED</Badge>
            </li>
            <li className="flex justify-between gap-2">
              <span>Netshift-FY2025.csv</span>
              <Badge tone="success">READY</Badge>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

export default function WorkspaceDesignSpecimen() {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="min-h-dvh bg-workspace px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="space-y-2">
          <Breadcrumbs
            items={[{ label: "Design system", href: "/design-system" }, { label: "Workspace" }]}
          />
          <h1 className="text-3xl text-navy">Phase 9C workspace specimens</h1>
          <p className="max-w-2xl text-sm text-text-secondary">
            Visual fixtures for owner review. Labels mark sample data. Live authenticated routes use
            the same shell with real APIs.
          </p>
          <Link href="/design-system" className="text-sm font-medium text-emerald">
            ← Design system
          </Link>
        </header>

        <section className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={collapsed ? "secondary" : "primary"} onClick={() => setCollapsed(false)}>
              Expanded sidebar
            </Button>
            <Button size="sm" variant={collapsed ? "primary" : "secondary"} onClick={() => setCollapsed(true)}>
              Collapsed sidebar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDrawer(true)}>
              Open mobile drawer
            </Button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface p-4">
            <div className="flex min-w-[720px] gap-4">
              <FixtureSidebar collapsed={collapsed} />
              <div className="min-w-0 flex-1 p-2">
                <FixtureDashboard />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl text-navy">Empty dashboard</h2>
          <div className="rounded-2xl border border-border bg-surface p-6">
            <FixtureDashboard empty />
          </div>
        </section>
      </div>

      {drawer ? (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation fixture"
          data-testid="fixture-mobile-drawer"
        >
          <button
            type="button"
            className="absolute inset-0 bg-overlay"
            aria-label="Close"
            onClick={() => setDrawer(false)}
          />
          <aside className="relative z-10 h-full w-[min(100%,18rem)] bg-surface shadow-lg">
            <div className="flex justify-end p-2">
              <Button size="sm" variant="ghost" onClick={() => setDrawer(false)}>
                Close
              </Button>
            </div>
            <FixtureSidebar collapsed={false} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
