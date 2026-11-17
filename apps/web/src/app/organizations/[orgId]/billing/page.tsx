"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, EmptyState, Skeleton } from "../../../../components/ui";
import { apiFetch } from "../../../../lib/api";

type EntitlementRow = {
  id: string;
  code: string;
  scopeType: string;
  scopeId: string | null;
  sourceType: string;
  validUntil: string | null;
  revokedAt: string | null;
};

type PurchaseRow = {
  id: string;
  productCode?: string;
  status?: string;
  amountMinor?: number;
  currency?: string;
  reportId?: string | null;
  createdAt?: string;
};

type SubscriptionRow = {
  id: string;
  planCode?: string;
  status?: string;
  currentPeriodEnd?: string | null;
  graceUntil?: string | null;
};

type VerifyBody = {
  providerStatus?: string;
  fulfillment?: { status?: string };
  payment?: { status?: string };
  message?: string;
};

const MAX_PENDING_POLLS = 8;
const POLL_INTERVAL_MS = 2500;

function formatMoney(amountMinor?: number, currency?: string) {
  if (amountMinor == null || !currency) return "—";
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}

function BillingInner() {
  const params = useParams<{ orgId: string }>();
  const search = useSearchParams();
  const orgId = params.orgId;
  const reference = search.get("reference");
  const reportId = search.get("reportId");
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [entitlements, setEntitlements] = useState<EntitlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
  const [verifyTone, setVerifyTone] = useState<"success" | "error" | "info">("info");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollCount = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verifyAgainRef = useRef<(manual: boolean) => Promise<void>>(async () => {});

  const reloadBilling = useCallback(async () => {
    setLoading(true);
    const [p, s, e] = await Promise.all([
      apiFetch<{ purchases?: PurchaseRow[]; message?: string }>(
        `/organizations/${orgId}/billing/purchases`,
      ),
      apiFetch<{ subscriptions?: SubscriptionRow[]; message?: string }>(
        `/organizations/${orgId}/billing/subscriptions`,
      ),
      apiFetch<{ entitlements?: EntitlementRow[]; message?: string }>(
        `/organizations/${orgId}/billing/entitlements`,
      ),
    ]);
    if (p.status >= 400 || s.status >= 400 || e.status >= 400) {
      setError("Unable to load billing data");
      setLoading(false);
      return;
    }
    setError(null);
    setPurchases(p.body.purchases ?? []);
    setSubscriptions(s.body.subscriptions ?? []);
    setEntitlements(e.body.entitlements ?? []);
    setLoading(false);
  }, [orgId]);

  const runVerify = useCallback(
    async (manual: boolean) => {
      if (!reference) return;
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
        pollTimer.current = null;
      }
      if (manual) {
        pollCount.current = 0;
      }
      setVerifyBusy(true);
      setVerifyNote("Payment pending verification…");
      setVerifyTone("info");
      setCanRetry(false);
      const { status, body } = await apiFetch<VerifyBody>(
        `/organizations/${orgId}/billing/payments/verify`,
        {
          method: "POST",
          json: { reference },
        },
      );
      setVerifyBusy(false);
      if (status >= 400) {
        setVerifyTone("error");
        setVerifyNote(body.message ?? "Verification failed");
        setCanRetry(true);
        return;
      }

      const fulfillment = body.fulfillment?.status;
      const provider = body.providerStatus;

      if (provider === "success" && fulfillment === "FULFILLED") {
        setVerifyTone("success");
        setVerifyNote("Payment successful. Entitlements are active — report unlocked.");
        setCanRetry(false);
        await reloadBilling();
        return;
      }
      if (fulfillment === "ALREADY_FULFILLED") {
        setVerifyTone("success");
        setVerifyNote("Payment was already fulfilled. Download remains available.");
        setCanRetry(false);
        await reloadBilling();
        return;
      }
      if (provider === "failed" || fulfillment === "FAILED") {
        setVerifyTone("error");
        setVerifyNote(
          `Payment failed or was not successful (provider: ${provider ?? "unknown"}). The report stays locked.`,
        );
        setCanRetry(true);
        return;
      }
      if (provider === "expired" || body.payment?.status === "EXPIRED") {
        setVerifyTone("error");
        setVerifyNote(
          "This checkout session expired before payment completed. Start a new unlock if you still need access.",
        );
        setCanRetry(false);
        return;
      }

      setVerifyTone("info");
      setVerifyNote(
        `Payment pending (provider: ${provider ?? "unknown"}). This page never treats a redirect alone as success.`,
      );
      setCanRetry(true);

      const shouldPoll = !manual;
      if (shouldPoll && pollCount.current < MAX_PENDING_POLLS) {
        pollCount.current += 1;
        pollTimer.current = setTimeout(() => {
          void verifyAgainRef.current(false);
        }, POLL_INTERVAL_MS);
      } else if (shouldPoll) {
        setVerifyNote(
          `Payment still pending after automatic checks (provider: ${provider ?? "unknown"}). Use “Check status again” — this does not create a new checkout.`,
        );
      }
    },
    [orgId, reference, reloadBilling],
  );

  verifyAgainRef.current = runVerify;

  useEffect(() => {
    void reloadBilling();
  }, [reloadBilling]);

  useEffect(() => {
    if (!reference) return;
    pollCount.current = 0;
    void runVerify(false);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [reference, runVerify]);
  const activeEntitlements = entitlements.filter((row) => !row.revokedAt);

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-ink">Billing</h1>
      <p className="mt-2 text-muted">
        Purchases, subscriptions, and entitlements for this organization. Redirect return is not
        payment confirmation — the API verifies with Korapay (or the mock provider) first.
      </p>

      {verifyNote ? (
        <div className="mt-4" data-testid="billing-verify-banner">
          <Alert
            tone={verifyTone === "success" ? "success" : verifyTone === "error" ? "error" : "info"}
            title={
              verifyTone === "success"
                ? "Payment verified"
                : verifyTone === "error"
                  ? "Payment not unlocked"
                  : "Verification in progress"
            }
          >
            <p>{verifyNote}</p>
            {reportId && verifyTone === "success" ? (
              <Link
                className="mt-2 inline-block text-pine underline"
                href={`/organizations/${orgId}/reports/${reportId}`}
              >
                Open unlocked report
              </Link>
            ) : null}
            {canRetry && reference ? (
              <button
                type="button"
                className="mt-3 inline-flex min-h-10 items-center rounded-full border border-line bg-white px-4 text-sm text-ink disabled:opacity-60"
                disabled={verifyBusy}
                data-testid="billing-retry-status"
                onClick={() => void runVerify(true)}
              >
                {verifyBusy ? "Checking…" : "Check status again"}
              </button>
            ) : null}
          </Alert>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <Alert tone="error" title="Billing unavailable">
            {error}
          </Alert>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-10 space-y-4" data-testid="billing-loading">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          <section className="mt-10" data-testid="billing-entitlements">
            <h2 className="text-xl text-ink">Active entitlements</h2>
            <p className="mt-1 text-sm text-muted">
              Paid access is granted only after verified settlement. Free preview does not include
              PDF generation or download.
            </p>
            {activeEntitlements.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="No paid entitlements yet"
                  description="Unlock X-Ray Pro for a report, or subscribe to Opero OS, to generate and download published PDFs."
                />
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {activeEntitlements.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/70 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-ink">{row.code}</p>
                      <p className="text-sm text-muted">
                        {row.scopeType}
                        {row.scopeId ? ` · ${row.scopeId.slice(0, 8)}…` : ""} · {row.sourceType}
                      </p>
                    </div>
                    <Badge tone="success">Active</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10" data-testid="billing-purchases">
            <h2 className="text-xl text-ink">Purchases</h2>
            {purchases.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="No purchases"
                  description="One-time X-Ray Pro unlocks for a report will appear here after verified payment."
                />
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {purchases.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-2xl border border-line bg-white/70 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-ink">{row.productCode ?? "Purchase"}</p>
                      <Badge tone={row.status === "PAID" || row.status === "FULFILLED" ? "success" : "neutral"}>
                        {row.status ?? "UNKNOWN"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {formatMoney(row.amountMinor, row.currency)}
                      {row.createdAt ? ` · ${new Date(row.createdAt).toLocaleString()}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10" data-testid="billing-subscriptions">
            <h2 className="text-xl text-ink">Subscriptions</h2>
            <p className="mt-2 text-sm text-muted">
              Renewals are explicitly authorized checkouts. Opero does not auto-charge on a schedule.
            </p>
            {subscriptions.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="No subscriptions"
                  description="Opero OS plans grant organization-wide report generation and download while active."
                />
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {subscriptions.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-2xl border border-line bg-white/70 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-ink">{row.planCode ?? "Subscription"}</p>
                      <Badge tone="info">{row.status ?? "UNKNOWN"}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {row.currentPeriodEnd
                        ? `Period ends ${new Date(row.currentPeriodEnd).toLocaleDateString()}`
                        : "Period end not recorded"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      <div className="mt-10 flex flex-wrap gap-3">
        <Link className="text-pine no-underline" href={`/organizations/${orgId}`}>
          Organization
        </Link>
        <Link className="text-pine no-underline" href="/pricing">
          Public pricing
        </Link>
        <Link className="text-pine no-underline" href="/legal/payments">
          Payments &amp; refunds
        </Link>
        <Link className="text-pine no-underline" href="/legal/terms">
          Terms
        </Link>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="mt-6 h-28 w-full" />
        </div>
      }
    >
      <BillingInner />
    </Suspense>
  );
}
