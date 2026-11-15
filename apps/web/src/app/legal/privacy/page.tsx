import type { Metadata } from "next";
import { LegalDoc } from "../../../components/legal/legal-doc";

export const metadata: Metadata = {
  title: "Privacy Policy (Draft) · Opero",
  description: "Draft privacy policy for the Opero invitation-only pilot — subject to legal review.",
};

export default function PrivacyPage() {
  return (
    <LegalDoc title="Privacy Policy">
      <section>
        <h2>1. Who we are</h2>
        <p>
          This draft describes how <strong>[OPERATOR_LEGAL_NAME]</strong> (“we”, “us”) processes
          personal data when you use Opero. Final controller identity and NDPR registration
          details require owner confirmation:{" "}
          <strong>[NDPR_REGISTRATION_PLACEHOLDER]</strong>.
        </p>
      </section>
      <section>
        <h2>2. Data we process</h2>
        <ul>
          <li>Account data: name, email, authentication credentials (hashed), session cookies.</li>
          <li>
            Organization and membership data: organization names, roles, invitations.
          </li>
          <li>
            Customer Content: uploaded financial documents, extracted line items, review
            decisions, diagnostics, AI narratives, and reports.
          </li>
          <li>Billing metadata: payment references, amounts, entitlement grants (not full card PANs).</li>
          <li>Technical logs: IP, user agent, request IDs, security and audit events.</li>
        </ul>
      </section>
      <section>
        <h2>3. Purposes and legal bases (draft)</h2>
        <p>
          We process data to provide the Services, secure accounts, detect abuse, improve
          reliability, fulfill contracts for paid entitlements, and comply with law. Specific
          NDPR lawful bases will be confirmed by counsel.
        </p>
      </section>
      <section>
        <h2>4. Financial document processing</h2>
        <p>
          Documents may be scanned for malware, stored in private object storage, processed by
          extraction and diagnostic pipelines, and accessed only by authorized organization
          members and Operator personnel under least-privilege procedures. Direct public object
          URLs are not issued for customer downloads.
        </p>
      </section>
      <section>
        <h2>5. AI processing</h2>
        <p>
          If AI interpretation is enabled, structured and/or textual context derived from your
          diagnostics may be sent to a configured AI provider (for example OpenAI) under Operator
          contracts. Do not upload data you are not permitted to process with such providers.
        </p>
      </section>
      <section>
        <h2>6. Third-party processors (illustrative)</h2>
        <ul>
          <li>Hosting / compute: Railway (or successor) — <strong>[HOSTING_REGION_PLACEHOLDER]</strong></li>
          <li>Object storage: Cloudflare R2 or S3-compatible private buckets</li>
          <li>Email delivery: Resend (or configured mail driver)</li>
          <li>Payments: Korapay (when live payments are enabled)</li>
          <li>Optional AI: configured model provider</li>
        </ul>
        <p>A final sub-processor list will be published after legal review.</p>
      </section>
      <section>
        <h2>7. Retention and deletion</h2>
        <p>
          Document retention metadata uses a configurable retention period (default engineering
          setting: 365 days). Soft-delete removes object bytes when possible.{" "}
          <strong>Automated purge of expired rows is not yet implemented</strong> — deletion
          requests during the pilot should be sent to{" "}
          <strong>[PRIVACY_REQUEST_EMAIL_PLACEHOLDER]</strong> and will be handled manually.
        </p>
      </section>
      <section>
        <h2>8. Your rights</h2>
        <p>
          Subject to Nigerian data protection law, you may request access, correction, deletion,
          or restriction. Identity verification may be required. Response timelines will follow
          the approved policy.
        </p>
      </section>
      <section>
        <h2>9. Security</h2>
        <p>
          We apply multi-tenant isolation, session authentication, CSRF protections, encryption
          in transit (TLS), private storage, and environment validation that forbids insecure
          production configurations such as mock payments.
        </p>
      </section>
      <section>
        <h2>10. International transfers</h2>
        <p>
          Processors may store or process data outside Nigeria. Transfer safeguards will be
          documented after counsel review: <strong>[TRANSFER_SAFEGUARD_PLACEHOLDER]</strong>.
        </p>
      </section>
      <section>
        <h2>11. Contact</h2>
        <p>
          Privacy contact: <strong>[PRIVACY_REQUEST_EMAIL_PLACEHOLDER]</strong>.
        </p>
      </section>
    </LegalDoc>
  );
}
