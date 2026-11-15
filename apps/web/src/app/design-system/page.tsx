"use client";

import { useState } from "react";
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Input,
  ProgressBar,
  Select,
  Skeleton,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  ToastProvider,
  Tooltip,
  TR,
  Tabs,
  useToast,
  HelpHint,
} from "../../components/ui";

function ToastDemo() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => toast.push({ tone: "success", title: "Saved", description: "Changes applied." })}
      >
        Success toast
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => toast.push({ tone: "error", title: "Failed", description: "Please try again." })}
      >
        Error toast
      </Button>
    </div>
  );
}

function Specimen() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-5 py-10 sm:px-8">
      <header className="space-y-3">
        <Breadcrumbs items={[{ label: "Opero", href: "/" }, { label: "Design system" }]} />
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald">Phase 9A</p>
        <h1 className="font-display text-4xl text-navy sm:text-5xl">Opero design foundation</h1>
        <p className="max-w-2xl text-text-secondary">
          Token, typography and component specimen for owner review. Product surfaces adopt these
          primitives in increments 9B–9F.
        </p>
        <p className="flex flex-wrap gap-4 text-sm font-medium">
          <a href="/design-system/workspace" className="text-emerald no-underline hover:underline">
            Workspace (9C)
          </a>
          <a href="/design-system/documents" className="text-emerald no-underline hover:underline">
            Documents (9D)
          </a>
          <a href="/design-system/diagnostics" className="text-emerald no-underline hover:underline">
            Diagnostics (9E)
          </a>
        </p>
      </header>

      <section className="space-y-4" aria-labelledby="colour-heading">
        <h2 id="colour-heading">Colour</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Navy", "bg-navy", "#101D32"],
            ["Emerald", "bg-emerald", "#087F6D"],
            ["Gold", "bg-gold", "#D6A85B"],
            ["Workspace", "bg-workspace border border-border", "#F7F9FC"],
            ["Info surface", "bg-info-surface", "#EAF2F8"],
            ["Slate", "bg-slate", "#64748B"],
          ].map(([label, cls, hex]) => (
            <div key={label} className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
              <div className={`h-16 ${cls}`} />
              <div className="px-3 py-2 text-sm">
                <p className="font-semibold text-text">{label}</p>
                <p className="font-data text-text-secondary">{hex}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="error">Error</Badge>
          <Badge tone="info">Info</Badge>
          <Badge tone="emerald">Emerald</Badge>
          <Badge tone="gold">Gold</Badge>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="type-heading">
        <h2 id="type-heading">Typography</h2>
        <Card>
          <p className="font-display text-3xl text-navy">DM Serif Display — editorial</p>
          <p className="mt-3 text-lg font-semibold">Plus Jakarta Sans — interface</p>
          <p className="mt-2 font-data text-sm text-text-secondary">
            Inter tabular — 1,440,000 · 12.50% · NGN 144,000,000
          </p>
        </Card>
      </section>

      <section className="space-y-4" aria-labelledby="controls-heading">
        <h2 id="controls-heading">Controls</h2>
        <Card className="space-y-4">
          <CardHeader title="Form primitives" description="Shared labels, hints and validation." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Email" type="email" placeholder="you@company.com" hint="Work email preferred" />
            <Input label="Amount" className="font-data" defaultValue="144000000" error="Scale confirmation required" />
            <Select label="Unit scale" defaultValue="THOUSANDS">
              <option value="ACTUAL">Actual</option>
              <option value="THOUSANDS">Thousands</option>
              <option value="MILLIONS">Millions</option>
            </Select>
            <div className="flex items-end">
              <Checkbox label="I confirm the monetary scale" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="gold">Gold</Button>
            <Button variant="danger">Danger</Button>
            <Button loading>Saving</Button>
          </div>
        </Card>
      </section>

      <section className="space-y-4" aria-labelledby="feedback-heading">
        <h2 id="feedback-heading">Feedback</h2>
        <div className="grid gap-3">
          <Alert tone="info" title="Deterministic calculations">
            Diagnostic scores use fixed formulas. AI narrative is labelled separately.
          </Alert>
          <Alert tone="warning" title="Scale needs review">
            Confirm whether figures are stated in thousands before publishing.
          </Alert>
          <Alert tone="error" title="Upload blocked">
            The file failed malware scanning and cannot be extracted.
          </Alert>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <ProgressBar value={64} label="Extraction progress" />
          <Spinner />
          <Skeleton className="h-8 w-40" />
          <Tooltip content="Raw value stays in statement units until scale is applied.">
            <button type="button" className="inline-flex items-center gap-1 text-sm text-emerald">
              Scale help <HelpHint />
            </button>
          </Tooltip>
        </div>
        <ToastDemo />
        <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
          Open confirm dialog
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => setConfirmOpen(false)}
          title="Discard draft review?"
          description="Unsaved corrections will be lost."
          confirmLabel="Discard"
          tone="danger"
        />
      </section>

      <section className="space-y-4" aria-labelledby="data-heading">
        <h2 id="data-heading">Data</h2>
        <Tabs
          items={[
            {
              id: "table",
              label: "Table",
              panel: (
                <Table>
                  <THead>
                    <TR>
                      <TH>Concept</TH>
                      <TH>Raw</TH>
                      <TH>Scale</TH>
                      <TH>Actual</TH>
                    </TR>
                  </THead>
                  <TBody>
                    <TR>
                      <TD>Revenue</TD>
                      <TD numeric>144,000</TD>
                      <TD>THOUSANDS</TD>
                      <TD numeric>144,000,000</TD>
                    </TR>
                    <TR>
                      <TD>Gross margin</TD>
                      <TD numeric>58.3%</TD>
                      <TD>ACTUAL</TD>
                      <TD>—</TD>
                    </TR>
                  </TBody>
                </Table>
              ),
            },
            {
              id: "empty",
              label: "Empty",
              panel: (
                <EmptyState
                  title="No diagnostics yet"
                  description="Upload and review a financial statement to unlock profitability and liquidity analysis."
                  action={<Button size="sm">Upload document</Button>}
                />
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <ToastProvider>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <main id="main">
        <Specimen />
      </main>
    </ToastProvider>
  );
}
