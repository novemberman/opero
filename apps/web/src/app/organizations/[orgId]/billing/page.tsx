"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SiteHeader } from "../../../../components/site-header";
import { apiFetch } from "../../../../lib/api";

function BillingInner() {
  const params = useParams<{ orgId: string }>();
  const search = useSearchParams();
  const orgId = params.orgId;
  const reference = search.get("reference");
  const [purchases, setPurchases] = useState<unknown[]>([]);
  const [subscriptions, setSubscriptions] = useState<unknown[]>([]);
  const [entitlements, setEntitlements] = useState<unknown[]>([]);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [p, s, e] = await Promise.all([
        apiFetch<{ purchases?: unknown[]; message?: string }>(
          `/organizations/${orgId}/billing/purchases`,
        ),
        apiFetch<{ subscriptions?: unknown[]; message?: string }>(
          `/organizations/${orgId}/billing/subscriptions`,
        ),
        apiFetch<{ entitlements?: unknown[]; message?: string }>(
          `/organizations/${orgId}/billing/entitlements`,
        ),
      ]);
      if (p.status >= 400 || s.status >= 400 || e.status >= 400) {
        setError("Unable to load billing data");
        return;
      }
      setPurchases(p.body.purchases ?? []);
      setSubscriptions(s.body.subscriptions ?? []);
      setEntitlements(e.body.entitlements ?? []);
    })();
  }, [orgId]);

  useEffect(() => {
    if (!reference) return;
    void (async () => {
      const { status, body } = await apiFetch<{
        providerStatus?: string;
        fulfillment?: { status?: string };
        message?: string;
      }>(`/organizations/${orgId}/billing/payments/verify`, {
        method: "POST",
        json: { reference },
      });
      if (status >= 400) {
        setVerifyNote(body.message ?? "Verification failed");
        return;
      }
      if (body.providerStatus === "success" && body.fulfillment?.status === "FULFILLED") {
        setVerifyNote("Payment verified. Entitlements are active.");
      } else if (body.fulfillment?.status === "ALREADY_FULFILLED") {
        setVerifyNote("Payment was already fulfilled.");
      } else {
        setVerifyNote(
          `Payment not confirmed yet (provider: ${body.providerStatus ?? "unknown"}). This page never treats a redirect alone as success.`,
        );
      }
    })();
  }, [orgId, reference]);

  return (
    <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-ink">Billing</h1>
      <p className="mt-2 text-muted">
        Purchases, subscriptions, and entitlements for this organization. Redirect return is not
        payment confirmation — the API verifies with Korapay (or the mock provider) first.
      </p>
      {verifyNote ? <p className="mt-4 text-sm text-pine">{verifyNote}</p> : null}
      {error ? <p className="mt-4 text-copper">{error}</p> : null}

      <section className="mt-10">
        <h2 className="text-xl text-ink">Active entitlements</h2>
        <pre className="mt-3 overflow-auto border border-line bg-paper/60 p-4 text-xs text-ink">
          {JSON.stringify(entitlements, null, 2)}
        </pre>
      </section>
      <section className="mt-10">
        <h2 className="text-xl text-ink">Purchases</h2>
        <pre className="mt-3 overflow-auto border border-line bg-paper/60 p-4 text-xs text-ink">
          {JSON.stringify(purchases, null, 2)}
        </pre>
      </section>
      <section className="mt-10">
        <h2 className="text-xl text-ink">Subscriptions</h2>
        <p className="mt-2 text-sm text-muted">
          Renewals are explicitly authorized checkouts. Opero does not auto-charge on a schedule in
          Phase 7A.
        </p>
        <pre className="mt-3 overflow-auto border border-line bg-paper/60 p-4 text-xs text-ink">
          {JSON.stringify(subscriptions, null, 2)}
        </pre>
      </section>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link className="text-pine no-underline" href={`/organizations/${orgId}`}>
          Organization
        </Link>
        <Link className="text-pine no-underline" href="/pricing">
          Public pricing
        </Link>
      </div>
    </main>
  );
}

export default function BillingPage() {
  return (
    <>
      <SiteHeader mark="Billing" />
      <Suspense fallback={<main className="mx-auto max-w-4xl px-5 py-12">Loading billing…</main>}>
        <BillingInner />
      </Suspense>
    </>
  );
}
