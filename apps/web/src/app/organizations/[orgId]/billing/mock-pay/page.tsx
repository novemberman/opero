"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { apiFetch } from "../../../../../lib/api";

type PayState =
  | "ready"
  | "pending"
  | "settling"
  | "success"
  | "failed"
  | "cancelled"
  | "error";

function MockPayInner() {
  const params = useParams<{ orgId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const orgId = params.orgId;
  const reference = search.get("reference")?.trim() ?? "";
  const reportId = search.get("reportId")?.trim() ?? "";
  const checkoutId = search.get("checkoutId")?.trim() ?? "";

  const [state, setState] = useState<PayState>(reference ? "ready" : "error");
  const [note, setNote] = useState<string | null>(
    reference ? null : "Missing payment reference. Restart checkout from the report unlock page.",
  );
  const [providerStatus, setProviderStatus] = useState<string | null>(null);

  const reportHref = useMemo(
    () =>
      reportId
        ? `/organizations/${orgId}/reports/${reportId}`
        : `/organizations/${orgId}/billing`,
    [orgId, reportId],
  );

  async function settle(outcome: "success" | "failed" | "abandoned") {
    if (!reference) return;
    setState(outcome === "abandoned" ? "cancelled" : "settling");
    setNote(
      outcome === "success"
        ? "Confirming payment with the server…"
        : outcome === "failed"
          ? "Recording a failed test payment…"
          : "Cancelling without settlement…",
    );
    setProviderStatus(null);

    if (outcome === "abandoned") {
      setState("cancelled");
      setNote("Payment cancelled. The report remains locked until a successful settlement.");
      return;
    }

    setState("pending");
    const { status, body } = await apiFetch<{
      providerStatus?: string;
      fulfillment?: { status?: string };
      message?: string;
      code?: string;
    }>(`/organizations/${orgId}/billing/payments/mock-settle`, {
      method: "POST",
      json: { reference, outcome },
    });

    if (status === 404) {
      setState("error");
      setNote(
        "Mock settlement is unavailable. This environment is not running PAYMENT_PROVIDER=mock.",
      );
      return;
    }
    if (status >= 400) {
      setState("error");
      setNote(body.message ?? "Settlement failed");
      return;
    }

    setProviderStatus(body.providerStatus ?? null);
    const fulfillment = body.fulfillment?.status;
    if (
      outcome === "success" &&
      body.providerStatus === "success" &&
      (fulfillment === "FULFILLED" || fulfillment === "ALREADY_FULFILLED")
    ) {
      setState("success");
      setNote(
        fulfillment === "ALREADY_FULFILLED"
          ? "Payment was already fulfilled. Report download is unlocked."
          : "Payment successful. Report download is unlocked.",
      );
      return;
    }

    setState("failed");
    setNote(
      `Payment not successful (provider: ${body.providerStatus ?? "unknown"}, fulfillment: ${fulfillment ?? "none"}). The report stays locked.`,
    );
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-12 sm:px-8">
      <p className="text-sm uppercase tracking-[0.16em] text-pine">Staging mock checkout</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">
        Test payment
      </h1>
      <p className="mt-3 text-muted">
        This page only appears when the API payment provider is <span className="font-data">mock</span>.
        Nothing is unlocked until the API settles the charge and confirms entitlement.
      </p>

      <dl className="mt-6 space-y-2 border border-line bg-paper/60 p-4 text-sm text-ink">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Status</dt>
          <dd className="font-medium capitalize">{state}</dd>
        </div>
        {reference ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Reference</dt>
            <dd className="max-w-[14rem] truncate font-data text-xs" title={reference}>
              {reference}
            </dd>
          </div>
        ) : null}
        {checkoutId ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Checkout</dt>
            <dd className="max-w-[14rem] truncate font-data text-xs" title={checkoutId}>
              {checkoutId}
            </dd>
          </div>
        ) : null}
        {providerStatus ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Provider</dt>
            <dd className="font-data text-xs">{providerStatus}</dd>
          </div>
        ) : null}
      </dl>

      {note ? (
        <p
          className={`mt-4 text-sm ${state === "success" ? "text-pine" : state === "error" || state === "failed" ? "text-copper" : "text-muted"}`}
        >
          {note}
        </p>
      ) : null}

      {state === "ready" || state === "failed" || state === "error" || state === "cancelled" ? (
        <div className="mt-8 flex flex-col gap-3">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-pine px-5 text-paper disabled:opacity-60"
            disabled={!reference}
            onClick={() => void settle("success")}
            type="button"
          >
            Complete test payment
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line px-5 text-ink disabled:opacity-60"
            disabled={!reference}
            onClick={() => void settle("failed")}
            type="button"
          >
            Simulate payment failure
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-transparent px-5 text-muted"
            onClick={() => void settle("abandoned")}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {state === "pending" || state === "settling" ? (
        <p className="mt-8 text-sm text-muted">Waiting for server confirmation…</p>
      ) : null}

      {state === "success" ? (
        <div className="mt-8 flex flex-col gap-3">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-pine px-5 text-paper no-underline"
            href={reportHref}
          >
            Open report — download available
          </Link>
          <button
            className="text-sm text-pine underline"
            type="button"
            onClick={() => router.push(`/organizations/${orgId}/billing?reference=${encodeURIComponent(reference)}`)}
          >
            View billing entitlements
          </button>
        </div>
      ) : null}

      {state !== "success" ? (
        <Link className="mt-10 inline-block text-pine no-underline" href={reportHref}>
          Back without paying
        </Link>
      ) : null}
    </div>
  );
}

export default function MockPayPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-lg px-5 py-12 text-muted">Loading mock checkout…</div>}>
      <MockPayInner />
    </Suspense>
  );
}
