import type { Metadata } from "next";
import { LegalDoc } from "../../../components/legal/legal-doc";

export const metadata: Metadata = {
  title: "Payments, refunds & cancellation (Draft) · Opero",
  description:
    "Draft payment, refund and cancellation disclosures for Opero — subject to legal review.",
};

export default function PaymentsLegalPage() {
  return (
    <LegalDoc title="Payments, refunds & cancellation">
      <section>
        <h2>1. Paid features</h2>
        <p>
          Certain Opero features — including X-Ray Pro unlock for full report and PDF download —
          require payment. Prices are shown at checkout in the stated currency (pilot default:
          NGN unless otherwise displayed).
        </p>
      </section>
      <section>
        <h2>2. Payment processing</h2>
        <p>
          When live payments are enabled, card and bank payments are processed by Korapay (or a
          successor provider named at checkout). Opero does not store full card numbers. During
          staging and engineering tests, a mock provider may be used; mock settlement is never
          permitted in production.
        </p>
        <p>
          Entitlements are granted only after Opero verifies payment status with the provider
          (webhook and/or verification APIs). Completing a browser redirect alone does not unlock
          paid content.
        </p>
      </section>
      <section>
        <h2>3. Refunds (draft policy — owner approval required)</h2>
        <p>
          Proposed pilot stance (not yet binding):{" "}
          <strong>[REFUND_POLICY_PLACEHOLDER]</strong>. Until approved, refund requests should be
          emailed to <strong>[BILLING_SUPPORT_EMAIL_PLACEHOLDER]</strong> with payment reference,
          organization name, and reason. Chargebacks follow the payment provider’s rules.
        </p>
      </section>
      <section>
        <h2>4. Cancellation</h2>
        <p>
          One-time unlock purchases are not subscriptions unless a future plan explicitly says
          otherwise. Organization admins may stop further purchases at any time. Account closure
          requests: <strong>[SUPPORT_CONTACT_PLACEHOLDER]</strong>. Deletion of Customer Content
          follows the Privacy Policy draft.
        </p>
      </section>
      <section>
        <h2>5. Taxes</h2>
        <p>
          Prices may be shown exclusive or inclusive of applicable taxes as configured. VAT/WHT
          treatment for Nigerian customers:{" "}
          <strong>[TAX_TREATMENT_PLACEHOLDER]</strong>.
        </p>
      </section>
      <section>
        <h2>6. Failed or pending payments</h2>
        <p>
          If verification fails or a webhook is delayed, entitlements remain locked. Contact
          support with the checkout reference. Do not share card secrets with Opero staff.
        </p>
      </section>
    </LegalDoc>
  );
}
