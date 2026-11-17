# M13 COMMERCIAL READINESS REPORT

**Date:** 2026-11-17  
**Authorization:** Autonomous local development, read-only production inspection, isolated mock/sandbox validation only  
**Overall verdict:** **PARTIAL PASS** — engineering + production synthetic path ready; **sandbox Gate C PASS**; **live AI** and **live payment settlement** remain **BLOCKED** for commercial launch  

| Baseline | Value |
|----------|--------|
| M12-H2 synthetic publication | **PASS** |
| Production API | `b4f703497fbbf2b798b84e2d381d8aadda61b297` |
| Worker / Web | `09037c7a48279bf1350ced6dd3dec91a552a3cb7` |
| Synthetic issuance | **OFF** (`issuanceOpen=false`) |
| Active test grants | **0** |
| Payments | **0** |
| Published synthetic report | **1** (`0823d65f-38f8-4471-9d69-f4cac1e4d96f`) |

**Not performed:** live Korapay charges, live AI calls, production deploys, migrations, registration/upload/checkout activation, synthetic-grant enablement, infrastructure purchases.  
**Performed (isolated):** M13-B sandbox Gate C settle+fulfill on `korapay-rehearsal` only.

**STOP FOR OWNER REVIEW.**

---

## Layered acceptance status (explicit)

| Layer | Status | Evidence basis |
|-------|--------|----------------|
| Local engineering acceptance | **PASS** | M3–M10 / M4 AI / billing IT / M8 security |
| Rehearsal acceptance | **PASS** (payments) / **PARTIAL** (AI) | M13-B sandbox Gate C **PASS** on `opero_29ef2711…` (success → webhook → fulfill → PDF). Mock AI only; live AI still open |
| Production synthetic acceptance | **PASS** | M12-H2 publish + PDF + revoke + shutdown |
| Live AI provider acceptance | **BLOCKED** | No production OpenAI credentials; never exercised |
| Real payment settlement acceptance | **PARTIAL** | **Sandbox** authentic settle **PASS** (M13-B). **Live** keys present but checkout emergency ON; no live-money settle |
| Public commercial readiness | **NO-GO** | Emergencies ON; registration disabled; live Gate C + live AI open |

---

## M13-A — Live AI provider readiness

### Architecture audit

| Control | Verdict | Evidence |
|---------|---------|----------|
| Provider-neutral port | **PASS** | `packages/ai` `AiProviderPort`; `createAiProvider` / `createAiProviderFromEnv` (`factory.ts`) — default **mock**, no network unless `openai` |
| Credential configuration | **PASS** (schema) / **BLOCKED** (prod) | `AI_PROVIDER` enum `mock\|openai`; openai requires `OPENAI_API_KEY` + `OPENAI_MODEL` (`apps/api/src/config/env.ts`). Production API/worker: `AI_PROVIDER` **absent** → mock; `OPENAI_API_KEY` **absent** |
| Model selection | **PASS** | Env `OPENAI_MODEL`; mock uses `mock-deterministic-v1` |
| Prompt versioning | **PASS** | `PROMPT_VERSION = ai.interpret.v2` (`packages/ai/src/prompt.ts`) persisted on runs |
| Structured output validation | **PASS** | Zod `parseAiNarrativeJson` (`schema.ts`); openai path throws `INVALID_OUTPUT` — no silent fallback narrative |
| Source-grounded numerical claims | **PASS** (with residual) | Prompt forbids invention; `grounding.ts` + publish `assertNoCriticalGrounding`; residual D-P2-005 lexical figure matching |
| Timeout | **PASS** | `AI_TIMEOUT_MS` default 30s; abort + race in `OpenAiCompatibleProvider` |
| Retry | **PARTIAL** | Queue attempts via `AI_MAX_RETRIES` (default 1 → 2 attempts) in `ai.service.ts`; HTTP provider itself does **not** auto-retry inside a single attempt |
| Usage limits | **MISSING** | No per-org / per-day AI call quota in code |
| Cost ceilings | **MISSING** | No hard $ / ₦ spend governor in-app; relies on provider dashboard + owner process |
| Data privacy / retention | **PARTIAL** | Facts-only prompt; narratives stored in DB; document retention dry-run only (D-P1-011); no OpenAI data-retention DPA attestation on file |
| Provider failure handling | **PASS** | `AiProviderError` classes; failed job does not mutate diagnostic metrics (worker/API IT) |
| Mock / live separation | **PASS** | Mock sets `isSimulated: true`; openai sets `false`; UI/PDF disclose simulated; factory refuses unknown providers |

### Production RO posture (AI)

- Queues idle; provider path mock-default.  
- Prior production AI run remains mock (`7623fd63-…`).  
- Defect D-P2-009 remains **BLOCKED_EXTERNAL**.

### Minimal budget-capped live AI acceptance plan (not authorized)

1. **Owner auth phrase** (proposed): `AUTHORIZE OPERO M13-A LIVE AI PROVIDER ACCEPTANCE`  
2. **Credentials:** OpenAI (or compatible) key in **worker + API** with `AI_PROVIDER=openai`, `OPENAI_MODEL` pinned (e.g. `gpt-4.1-mini` or owner-chosen), optional `OPENAI_BASE_URL`.  
3. **Budget cap (proposed):** ≤ **USD $5** provider spend · ≤ **3** interpretation runs · single pilot org · one existing diagnostic (`ad64efd5-…` or owner-approved).  
4. **Hard stops:** disable `AI_PROVIDER` back to mock immediately after runs; revoke/rotate key if policy requires.  
5. **Acceptance checks:** schema-valid narrative; `isSimulated=false`; grounding critical=0 or explicit fail; no invented overall BHS; metrics unchanged; cost receipt from provider dashboard.  
6. **Out of scope:** public claims of “live AI product” without this gate; multi-tenant blast; report republish unless separately authorized.

---

## M13-B — Korapay Gate C

### Capability audit

| Control | Verdict | Evidence |
|---------|---------|----------|
| Hosted checkout | **PASS** (sandbox) | M13-B: Opero checkout → `test-checkout.korapay.com` → sandbox instrument → Korapay `success` ₦15,000 (`opero_29ef2711…`). Historical unpaid `opero_af4def5d…` retained as unpaid-session note |
| Post-payment browser return | **PASS** (production) | M13-B2 fix + M13-B3 prod API/web @ `e3c676b`: `/billing/return` 200; return-context authz; sandbox refs do not unlock prod (D-P1-015) |
| Callback / verify | **PASS** | `verifyAndFulfill` + provider verify `success`; response `ALREADY_FULFILLED` after webhook path |
| Webhook signature verification | **PASS** | Authentic `charge.success` with `signature_valid=true`; forged signature → `valid:false` / `invalid_signature` / no grant |
| Settlement status | **PASS** (sandbox) / **BLOCKED** (live) | Sandbox: payment+intent `SUCCEEDED`, fulfilled, amount match. Live money: not exercised |
| Transaction reconciliation | **MISSING** (job) / **PARTIAL** (ops) | No PENDING poller; manual playbook in payment-ops E1 |
| Duplicate webhook handling | **PASS** | Authentic replay → `{duplicate:true}`; grants stayed at **3** |
| Refunds | **PARTIAL** | Inbound `refund.success` revoke **PASS**; outbound Refund API **MISSING** (dashboard); `refund.failed` log-only |
| Chargebacks / disputes | **PASS** (code + IT) | PR2L-A webhook + manual dispute path; live scheme chargeback unprovable on demand |
| Entitlement issuance | **PASS** (sandbox E2E) | 3 PURCHASE grants (`full_report`, `pdf_download`, `report_generate`); PDF 200 / sibling 403 |
| Entitlement revocation | **PASS** (code/IT) | Refund / chargeback / manual dispute; previously downloaded PDFs not remotely recalled |
| Payment audit trails | **PASS** | `payment_events`, audits, `payment_dispute_actions`, `rawVerifySnapshot` |
| Emergency checkout shutdown | **PASS** | Production `EMERGENCY_DISABLE_CHECKOUT=true`; kills **new** checkouts only |

### Production RO posture (payments)

| Item | Observation |
|------|-------------|
| `PAYMENT_PROVIDER` | `korapay` |
| Key class | Live prefixes present (`sk_live_` / `pk_live_` — values not recorded here) |
| Checkout emergency | **ON** |
| Live pilot | unset → false |
| Payments / checkouts / purchases | **0** (M12-H2 baseline) |
| Webhook URL (Opero) | `https://opero-prd-api-production.up.railway.app/api/v1/billing/webhooks/korapay` |
| Dashboard webhook registration | **Owner-confirm required** (not readable via API) |

### Authentic provider evidence

**Sandbox Gate C (closed — M13-B PASS):** rehearsal Notification URL → init `opero_29ef2711…` → hosted test pay → Korapay `success` ₦15,000 → signed `charge.success` → verify → fulfill → 3 grants → PDF 200 / sibling 403 → duplicate webhook + invalid signature negative proofs. See `M13-B-KORAPAY-GATE-C-SANDBOX-TRANSACTION-ACCEPTANCE.md`.

**Still required for live Gate C (do not fabricate):**

1. Korapay **Live** dashboard Notification URL = production webhook URL.  
2. Allowlisted **₦100 live-pilot probe** (`LIVE_PILOT_*`) under separate owner authorization — not unrestricted XRAY_PRO.  
3. Same success → signed webhook → verify → fulfill → idempotency chain on **live** keys.  
4. Keep emergencies otherwise ON.

**Superseded unpaid artifact:** historical `opero_af4def5d…` `processing`/₦0 (`PR2-KORAPAY-GATE-C-HOSTED-CHECKOUT-FAILURE.md`). Mock settle alone never closes Gate C.

---

## M13-C — Operational readiness

| Area | Verdict | Notes |
|------|---------|-------|
| Monitoring / alerting | **PARTIAL** | Ops/status queues + soft ~$150 Railway alert (A9); UptimeRobot monitors submitted but **owner Activate / inbox delivery unconfirmed**; `alertNote` = no in-app pager |
| Worker reliability | **PASS** | BullMQ retries (docs/diagnostics/AI); queues idle/healthy; soft failed-job retention, no dedicated DLQ (M8 residual) |
| DB backups / PITR | **PASS** | Production PITR `enabled=true`, `bucketWired=true`, live available; A9 sibling restore drill done |
| Private report storage | **PASS** (prefix) / **PARTIAL** (bucket) | Org-prefixed keys; public URL 404; reports/docs/quarantine **shared** bucket (D-P2-001) |
| Tenant isolation | **PASS** | Org guards + IT; residual: foreign-org PDF path **500** vs clean **403** (M12-H2) |
| Data retention / deletion | **PARTIAL** | Soft-delete + dry-run; hard purge blocked on legal/hold policy (D-P1-011) |
| Administrative access | **PASS** | Ops token, dual synthetic secrets, RBAC |
| Customer onboarding | **PASS** (machinery) / **PARTIAL** (policy) | Bootstrap invite API + caps; `PILOT_INVITE_CODE` unset; registration disabled |
| Support workflows | **PARTIAL** | L1–L3 payment/dispute playbooks in ops docs; no ticketing/SLA product |
| Production cost estimates | **PASS** (documented) | A9/platform ~$40–90 steady / ceiling ~$235 soft; MTD≪ceiling in recent promotions |
| Incident response | **PARTIAL** | Kill switches + E5/E6 playbooks; secondary escalation / mailbox watch owner-pending |
| Recovery procedures | **PASS** | PITR restore + app rollback runbooks (A9/M11); quarterly drill checklist ongoing |

### Restricted customer pilot plan (proposed; not authorized)

1. Keep `PUBLIC_REGISTRATION_ENABLED=false`; use ops bootstrap invites only.  
2. Keep checkout emergency **ON** until **live** Gate C PASS (sandbox already PASS); optionally open timed `LIVE_PILOT_*` ₦100 probe under separate auth.  
3. Keep uploads behind timed `PILOT_UPLOAD_*` windows (emergency off only for allowlisted org).  
4. Cap orgs/users via `PILOT_MAX_*` when inviting beyond current pilot.  
5. AI stays **mock** until M13-A live acceptance; label simulated output.  
6. Support: OWNER + ops token; dispute manual path; no public self-serve billing disputes without entitlement.  
7. Exit criteria: ≤N invited orgs, zero unexplained payment anomalies, PITR green, emergencies restorable in <5 minutes.

---

## M13-D — Commercial launch decision

### GO / NO-GO

| Decision surface | Call |
|------------------|------|
| Continue dormant production + synthetic-proven publish path | **GO** (already live; commercial dormant) |
| Enable public registration / open uploads / open checkout | **NO-GO** |
| Claim live AI intelligence in product | **NO-GO** until M13-A |
| Claim sandbox Korapay settlement / paid entitlements | **GO** (rehearsal evidence only; see M13-B) |
| Claim live Korapay settlement / open checkout | **NO-GO** until live Gate C probe + policy |
| Restricted invited pilot (docs + mock AI + no pay) | **CONDITIONAL GO** after owner sets invite policy + optional upload window |
| Public commercial launch | **NO-GO** |

### External integration blockers

1. OpenAI (or compatible) API key + model + spend budget + retention/DPA acceptance.  
2. Korapay **dashboard** webhook registration attestation (test/live URL).  
3. **Live** Gate C probe evidence (sandbox closed by M13-B / D-P1-003 PARTIAL): live-pilot ₦100 → `success` → signed webhook → verify → fulfill.  
4. External uptime/alert delivery activation (UptimeRobot Activate + owner inbox).  
5. Optional: separate S3 reports/quarantine buckets (D-P2-001).

### Required credentials / provider approvals

| Item | Needed for |
|------|------------|
| `OPENAI_API_KEY` + `OPENAI_MODEL` (+ optional base URL) on API **and** worker | M13-A |
| Owner spend approval / provider billing alerts | M13-A |
| Korapay Live dashboard Notification URL confirm | Gate C live |
| Timed `LIVE_PILOT_*` + emergency checkout off for probe only | Live ₦100 settle |
| `PILOT_INVITE_CODE` / bootstrap invites | Restricted customer pilot |

### Proposed live-test budgets

| Test | Proposed cap |
|------|----------------|
| Live AI acceptance | ≤ **$5 USD** · ≤ **3** runs · one org |
| Korapay live probe | ≤ **₦100** × `LIVE_PILOT_MAX_SUCCESSES` (default 1) · allowlisted org/report only |
| Sandbox Gate C (test keys) | **₦0** real money · test instruments only |

### Remaining security / operational risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Live keys present while checkout dormant | Medium | Keep `EMERGENCY_DISABLE_CHECKOUT=true`; never disable without Gate C auth |
| Shared storage bucket | Medium | D-P2-001 bucket split before broad multi-tenant |
| No AI usage/cost governor | Medium | Provider dashboard limits + short acceptance window |
| Retention hard-purge absent | Low–Med | Policy then D-P1-011 execute |
| Thin external alerting | Medium | Wire Railway/uptime → owner contacts |
| Cross-org PDF 500 vs 403 | Low | Hardening follow-up |
| Stale `APP_VERSION` stamp | Low | D-P2-003 |

### Recommended launch sequence

1. **M13-A** live AI (budget-capped) — optional before commercial narrative claims.  
2. **Sandbox Gate C** (rehearsal `sk_test_`) with dashboard webhook attested — prove settle without live money.  
3. **Live Gate C probe** (`LIVE_PILOT` ₦100) — authentic settle + revoke/refund drill.  
4. **Restricted invited pilot** — registration still off; timed uploads; mock or verified live AI.  
5. **Separate S3 reports bucket** + alerting activation.  
6. **Public commercial** only after Gate C PASS, AI decision, support/IR checklist, emergencies policy for open checkout.

### Exact owner authorization requirements

| Action | Required authorization (proposed exact phrases) |
|--------|--------------------------------------------------|
| Live AI spend / config | `AUTHORIZE OPERO M13-A LIVE AI PROVIDER ACCEPTANCE` |
| Sandbox Gate C first charge | `AUTHORIZE OPERO KORAPAY GATE C SANDBOX FIRST TRANSACTION` (+ dashboard webhook confirm) |
| Live ₦100 probe | `AUTHORIZE OPERO LIVE PILOT ₦100 KORAPAY PROBE` (or successor Gate C live phrase) |
| Open checkout / disable emergency | Explicit emergency-off authorization naming duration + org scope |
| Open uploads window | Timed pilot-upload authorization (A12-A2-U style) |
| Public registration | Explicit registration-enable authorization |
| Synthetic grant re-enable | M12-H2-style dual-secret window authorization |
| Production deploy / migrate | Separate release authorization |
| Infrastructure purchases / bucket remap | Explicit infra authorization |

---

## Verdict summary

**PARTIAL PASS** for the M13 commercial readiness *program*: architecture and production synthetic publication are in good standing, emergency commercial dormancy holds, and the path to live AI / Gate C is documented.

**Public commercial launch: NO-GO.**

**STOP FOR OWNER REVIEW.**
