"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { SiteHeader } from "../../../../../../components/site-header";
import { apiFetch } from "../../../../../../lib/api";

export default function UnlockReportPage() {
  const params = useParams<{ orgId: string; reportId: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function startCheckout() {
    setPending(true);
    setError(null);
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `web-${Date.now()}`;
    const redirectUrl = `${window.location.origin}/organizations/${params.orgId}/billing?reportId=${params.reportId}`;
    const { status, body } = await apiFetch<{
      checkout?: { checkoutUrl?: string; paymentConfirmed?: boolean };
      message?: string;
    }>(`/organizations/${params.orgId}/billing/checkout/xray-pro`, {
      method: "POST",
      json: {
        reportId: params.reportId,
        idempotencyKey,
        redirectUrl,
      },
    });
    setPending(false);
    if (status >= 400) {
      setError(body.message ?? "Unable to start checkout");
      return;
    }
    if (body.checkout?.paymentConfirmed) {
      setError("Unexpected confirmed state before provider verification");
      return;
    }
    if (body.checkout?.checkoutUrl) {
      window.location.assign(body.checkout.checkoutUrl);
      return;
    }
    router.push(`/organizations/${params.orgId}/billing`);
  }

  return (
    <>
      <SiteHeader mark="Unlock" />
      <main className="mx-auto max-w-lg px-5 py-12 sm:px-8">
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-ink">
          Unlock X-Ray Pro
        </h1>
        <p className="mt-3 text-muted">
          One-time purchase at NGN 15,000 for this report. You will be redirected to Korapay checkout
          (or the local mock provider). Success is confirmed only after server-side verification.
        </p>
        {error ? <p className="mt-4 text-copper">{error}</p> : null}
        <button
          className="mt-8 inline-flex min-h-11 items-center rounded-full bg-pine px-5 text-paper disabled:opacity-60"
          disabled={pending}
          onClick={() => void startCheckout()}
          type="button"
        >
          {pending ? "Starting checkout…" : "Pay NGN 15,000"}
        </button>
        <p className="mt-4 text-xs text-muted">OWNER or ADMIN billing permission required.</p>
        <Link
          className="mt-8 inline-block text-pine no-underline"
          href={`/organizations/${params.orgId}/reports/${params.reportId}`}
        >
          Back to report
        </Link>
      </main>
    </>
  );
}
