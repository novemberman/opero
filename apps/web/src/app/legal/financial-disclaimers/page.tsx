import type { Metadata } from "next";
import { LegalDoc } from "../../../components/legal/legal-doc";

export const metadata: Metadata = {
  title: "Financial analysis limitations (Draft) · Opero",
  description:
    "Draft limitations and disclaimers for Opero financial document analysis — subject to legal review.",
};

export default function FinancialDisclaimersPage() {
  return (
    <LegalDoc title="Financial analysis limitations & disclaimers">
      <section>
        <h2>1. Nature of the product</h2>
        <p>
          Opero helps organizations organize uploaded financial statements, extract line items
          with human confirmation gates, run rule-based diagnostics, and optionally generate
          narrative interpretation. Outputs are tools for informed discussion — not a substitute
          for a licensed accountant, auditor, tax adviser, lawyer, or regulated investment advice.
        </p>
      </section>
      <section>
        <h2>2. Report limitations</h2>
        <ul>
          <li>
            Extraction may miss, mis-map, or omit figures. Material pending items can block
            financial readiness until resolved by a human reviewer.
          </li>
          <li>
            Diagnostics depend on confirmed statement data and documented eligibility rules. They
            do not certify that books are complete or free from fraud.
          </li>
          <li>
            AI narratives, where enabled, may omit nuance, misstate emphasis, or reflect model
            limitations even when grounding constraints apply.
          </li>
          <li>
            PDF and full reports reflect the data state at generation time and may become stale if
            underlying statements change.
          </li>
        </ul>
      </section>
      <section>
        <h2>3. No warranty of financial outcomes</h2>
        <p>
          The Operator does not guarantee credit approvals, investment performance, tax positions,
          regulatory filings, or any particular business outcome based on Opero outputs.
        </p>
      </section>
      <section>
        <h2>4. Customer responsibilities</h2>
        <ul>
          <li>Upload complete, accurate source documents you are authorized to process.</li>
          <li>Review and confirm extracted figures before treating readiness as reliable.</li>
          <li>Independently verify material numbers before sharing reports externally.</li>
          <li>
            Do not present Opero outputs as audited financial statements or statutory filings.
          </li>
        </ul>
      </section>
      <section>
        <h2>5. Jurisdiction note</h2>
        <p>
          These disclaimers are drafted for an initial Nigerian pilot audience. Sector-specific
          regulatory overlays (banking, capital markets, insurance) are out of scope unless
          separately contracted.
        </p>
      </section>
    </LegalDoc>
  );
}
