"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PublicFooter } from "../../components/marketing/public-footer";
import { PublicHeader } from "../../components/marketing/public-header";
import { Alert, Skeleton, buttonClassName } from "../../components/ui";
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
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const { status, body } = await apiFetch<{ products?: CatalogProduct[]; message?: string }>(
        "/billing/catalog",
      );
      if (status >= 400) {
        setError(body.message ?? "Unable to load pricing");
        setLoaded(true);
        return;
      }
      setProducts(body.products ?? []);
      setLoaded(true);
    })();
  }, []);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <PublicHeader />
      <main id="main" className="bg-workspace">
        <section className="border-b border-border bg-navy text-text-inverse">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald">Pricing</p>
            <h1 className="mt-3 max-w-2xl font-display text-4xl sm:text-5xl">Opero plans</h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-white/70">
              Nigerian launch pricing for X-Ray and Opero OS. Amounts are shown in NGN. Purchases
              keep the amount you checked out with.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
          {error ? (
            <Alert tone="error" title="Pricing unavailable">
              {error}
            </Alert>
          ) : null}

          {!loaded ? (
            <div className="grid gap-6 sm:grid-cols-2">
              <Skeleton className="h-48 w-full rounded-2xl" />
              <Skeleton className="h-48 w-full rounded-2xl" />
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {products.map((product) => {
                const price = product.prices[0];
                return (
                  <article
                    key={product.code}
                    className="flex flex-col rounded-2xl border border-border bg-surface p-6 shadow-sm"
                  >
                    <h2 className="text-xl font-semibold text-navy">{product.name}</h2>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-text-secondary">
                      {product.description}
                    </p>
                    <p className="mt-6 font-display text-3xl text-emerald">
                      {price?.amountDisplay ?? "Custom"}
                      {price?.interval === "MONTHLY" ? (
                        <span className="ml-2 font-sans text-base font-medium text-text-secondary">
                          / month
                        </span>
                      ) : null}
                      {product.kind === "ENTERPRISE" ? (
                        <span className="ml-2 font-sans text-base font-medium text-text-secondary">
                          quotation
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 font-data text-xs text-text-secondary">
                      {price
                        ? `${price.amountMinor.toLocaleString("en-NG")} kobo · ${price.currency}`
                        : "Contact sales"}
                    </p>
                  </article>
                );
              })}
            </div>
          )}

          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/register" className={buttonClassName({ size: "lg" })}>
              Create account
            </Link>
            <Link
              href="/pricing/enterprise"
              className={buttonClassName({ variant: "secondary", size: "lg" })}
            >
              Request Enterprise quote
            </Link>
            <Link href="/organizations" className={buttonClassName({ variant: "ghost", size: "lg" })}>
              Open an organization
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
