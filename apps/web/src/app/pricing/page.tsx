"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteHeader } from "../../components/site-header";
import { apiFetch } from "../../lib/api";

type CatalogProduct = {
  code: string;
  name: string;
  description: string | null;
  kind: string;
  prices: Array<{
    currency: string;
    amountMinor: number;
    amountDisplay: string;
    interval: string;
  }>;
};

export default function PricingPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { status, body } = await apiFetch<{ products?: CatalogProduct[]; message?: string }>(
        "/billing/catalog",
      );
      if (status >= 400) {
        setError(body.message ?? "Unable to load pricing");
        return;
      }
      setProducts(body.products ?? []);
    })();
  }, []);

  return (
    <>
      <SiteHeader mark="Pricing" />
      <main className="relative min-h-[70vh] overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(46,90,72,0.18),transparent_45%),linear-gradient(160deg,#f7f3ea_0%,#ebe4d6_48%,#dfe8e1_100%)]" />
        <div className="relative mx-auto max-w-5xl px-5 py-16 sm:px-8">
          <p className="font-[family-name:var(--font-display)] text-5xl tracking-tight text-ink sm:text-6xl">
            Opero
          </p>
          <h1 className="mt-4 max-w-2xl text-2xl text-ink sm:text-3xl">
            Nigerian launch pricing for X-Ray and Opero OS
          </h1>
          <p className="mt-3 max-w-xl text-muted">
            Amounts are shown in NGN. Prices are launch defaults and may change; purchases keep the
            amount you checked out with.
          </p>
          {error ? <p className="mt-6 text-copper">{error}</p> : null}
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {products.map((product) => {
              const price = product.prices[0];
              return (
                <section key={product.code} className="border-t border-line pt-6">
                  <h2 className="text-xl text-ink">{product.name}</h2>
                  <p className="mt-2 text-sm text-muted">{product.description}</p>
                  <p className="mt-4 font-[family-name:var(--font-display)] text-3xl text-pine">
                    {price?.amountDisplay ?? "Custom"}
                    {price?.interval === "MONTHLY" ? (
                      <span className="ml-2 text-base text-muted">/ month</span>
                    ) : null}
                    {product.kind === "ENTERPRISE" ? (
                      <span className="text-base text-muted"> quotation</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {price
                      ? `${price.amountMinor.toLocaleString("en-NG")} kobo · ${price.currency}`
                      : "Contact sales"}
                  </p>
                </section>
              );
            })}
          </div>
          <div className="mt-12 flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-11 items-center rounded-full bg-pine px-5 text-paper no-underline"
              href="/organizations"
            >
              Open an organization
            </Link>
            <Link
              className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-ink no-underline"
              href="/pricing/enterprise"
            >
              Request Enterprise quote
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
