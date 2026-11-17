"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Alert, Skeleton } from "../../../components/ui";
import { apiFetch } from "../../../lib/api";
import { buildOrgBillingReturnPath } from "../../../lib/billing-return";

type ReturnContext = {
  reference: string;
  organizationId: string;
  reportId: string | null;
  paymentStatus: string;
  checkoutStatus: string | null;
  fulfilled: boolean;
  expired: boolean;
  paymentConfirmed: boolean;
  message?: string;
};

function BillingReturnInner() {
  const search = useSearchParams();
  const router = useRouter();
  const reference = (search.get("reference") ?? "").trim();
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    if (!reference || reference.length < 8) {
      setError("Missing payment reference. Open Billing from your organization if you already paid.");
      return;
    }

    let cancelled = false;
    void (async () => {
      const { status, body } = await apiFetch<ReturnContext & { message?: string }>(
        `/billing/payments/return-context?reference=${encodeURIComponent(reference)}`,
      );
      if (cancelled) return;
      if (status === 401) {
        setUnauthorized(true);
        setError("Sign in to finish verifying this payment. The URL alone never unlocks a report.");
        return;
      }
      if (status >= 400) {
        setError(body.message ?? "Payment not found for your account.");
        return;
      }
      router.replace(
        buildOrgBillingReturnPath({
          organizationId: body.organizationId,
          reference: body.reference,
          reportId: body.reportId,
        }),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [reference, router]);

  return (
    <div className="mx-auto max-w-lg px-5 py-16 sm:px-8">
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink">
        Returning from checkout
      </h1>
      <p className="mt-2 text-muted">
        Checking your payment with Opero. A redirect from Korapay is not confirmation by itself.
      </p>

      {!error ? (
        <div className="mt-8 space-y-3" data-testid="billing-return-pending">
          <Alert tone="info" title="Verification in progress">
            <p>Looking up payment{reference ? ` ${reference.slice(0, 18)}…` : ""}.</p>
          </Alert>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="mt-8" data-testid="billing-return-error">
          <Alert tone="error" title={unauthorized ? "Sign in required" : "Unable to continue"}>
            <p>{error}</p>
            {unauthorized ? (
              <Link className="mt-3 inline-block text-pine underline" href="/login">
                Sign in
              </Link>
            ) : (
              <Link className="mt-3 inline-block text-pine underline" href="/organizations">
                Your organizations
              </Link>
            )}
          </Alert>
        </div>
      )}
    </div>
  );
}

export default function BillingReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-5 py-16 sm:px-8">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="mt-6 h-24 w-full" />
        </div>
      }
    >
      <BillingReturnInner />
    </Suspense>
  );
}
