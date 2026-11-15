# PR-0 Production Readiness Assessment

**Date:** 2026-11-15  
**Scope:** Limited production pilot readiness (read-only)  
**Baseline:** P0-A (48 PASS) + P0-B (50 PASS / 1 BLOCKED / 0 FAIL) on Railway staging  
**Authorization:** Assessment only — **not** authorization to deploy production

---

## Executive verdict

**Conditional no-go for open production. Conditional go for a tightly controlled pilot** only if the P0 blockers below are closed or explicitly accepted as out-of-band owner controls.

| Area | Readiness | Summary |
|------|-----------|---------|
| Customer experience | **Yellow** | Full product UX exists; staging API paths proven; browser journeys manual-only |
| Production payments | **Yellow → Red if live money** | Korapay architecture + refunds coded; live provider path not staging-accepted; no chargebacks |
| Security | **Green/Yellow** | Strong authZ/tenant/mock isolation; thin browser security headers; Swagger enabled |
| Reliability | **Yellow** | Deploy/rollback/health solid; weak monitoring, backup drills, DLQ |
| Financial intelligence | **Green** | P0-A integrity gates staging-proven |
| Commercial readiness | **Yellow/Red** | Catalog/entitlements ready; missing Terms/Privacy; retention purge missing |

---

## 1. Current readiness by area

### 1.1 Customer experience

**Verified**
- End-to-end product surface: register → org → upload → extraction review → readiness → diagnostics → AI → report → unlock/checkout → PDF.
- Staging API acceptance covers integrity and commercial unlock (P0-A/P0-B).
- Unpaid→paid PDF contract proven (403 `ENTITLEMENT_REQUIRED` → 200 PDF).

**Assumptions**
- Custom-domain cookie/CORS behavior matches staging Railway domains.
- Owner will complete manual UI walkthroughs before inviting customers.

**Manual browser acceptance still required**
1. Registration / email verify / login (Resend path).
2. Document upload drag-drop + progress + review board (“Correct & confirm”).
3. Readiness blocked→ready UX.
4. Diagnostics / score presentation.
5. Unlock → checkout → (live) payment return messaging.
6. Mock-pay is staging-only; production needs Korapay hosted checkout UX.
7. Report unlocked state only after API entitlement confirm.
8. PDF download from report page.

### 1.2 Production payments

**Verified**
- Provider port + `KorapayProvider` + `MockKorapayProvider`.
- Initialize / verify / webhook HMAC (`x-korapay-signature`) / re-verify before grant.
- Amount + currency match; fulfillment lock; checkout idempotency keys; `PaymentEvent` dedupe.
- `refund.success` revokes purchase entitlements (integration-tested).
- Production boot forbids `PAYMENT_PROVIDER=mock` and `sk_test_` live keys; staging forbids `sk_live_`.
- Mock settle unavailable when provider ≠ mock (404).

**Assumptions**
- Korapay merchant KYC and live keys will be available.
- Dashboard webhook URL will point at production API.
- Subscriptions remain **manual renewal** (no Direct Debit) — intentional.

**Gaps**
- No live Korapay staging acceptance with `sk_test_` (checkout → webhook → fulfill → PDF).
- No chargeback / dispute handlers.
- No automated provider↔ledger reconciliation job.
- Multi-replica mock memory is staging-only (fail closed).

### 1.3 Security

**Verified**
- Session cookies (HttpOnly, SameSite, Secure in deployed envs), CSRF double-submit, password/session rotation patterns.
- Org membership + RBAC (`billing:manage` OWNER/ADMIN).
- Tenant isolation (cross-org 404) proven in P0-B.
- Env fail-closed for mock payments, mock scanner, non-S3 storage, insecure cookies, placeholder secrets.
- Private R2/S3; API-mediated downloads; storage key prefix checks; `Cache-Control: private, no-store` on PDF.
- Throttling (global + login + billing endpoints); production forbids disabled auth throttle.
- Log redaction for cookies/secrets.

**Assumptions**
- Railway edge provides TLS.
- ClamAV remains available for document scan in production.

**Gaps**
- No first-party Helmet/CSP/HSTS/X-Frame stack (edge-dependent).
- Swagger at `/api/v1/docs` is enabled in app configure path — confirm production exposure policy.
- No customer-facing audit UI (server-side audit writes exist).

### 1.4 Reliability

**Verified**
- Railway topology (web/api/worker/Postgres/Redis) documented.
- Health/ready probes used in staging acceptance.
- BullMQ queues with retries/backoff for documents/diagnostics/AI.
- Migration runbook with advisory lock; rollback runbook (redeploy prior images).
- Storage provisioning notes for private buckets.

**Assumptions**
- Railway automated backups are enabled (not verified in this assessment).
- Single-region R2 durability is acceptable for pilot.

**Gaps**
- No monitoring/alerting/Sentry/on-call/incident response runbook.
- No documented restore drill / RPO-RTO.
- Failed jobs retained (`removeOnFail`) but no productized DLQ ops.
- PDF render on publish is synchronous in API (latency/failure coupling).

### 1.5 Financial intelligence

**Verified (P0-A)**
- CONFIRMED-only monetary eligibility into authoritative diagnostics.
- Material pending → readiness **BLOCKED**.
- Historical contaminated snapshots demoted (`authoritative=false`, non-verified presentation).
- Publish refuses blocked readiness; grounding gates for AI narratives.
- Failed diagnostic/AI terminal states with audit.

**Assumptions**
- Synthetic + limited Netshift coverage generalizes to pilot customer statements.
- Mock AI is acceptable for pilot narratives, or OpenAI is configured with grounding.

**Gaps**
- Live OpenAI soak not staging-accepted (P0-B AI **BLOCKED**).
- Taxonomy coverage for diverse real statements still evolving (Increment C deferred).

### 1.6 Commercial readiness

**Verified**
- Launch catalog `launch.v1` (X-Ray Free/Pro, OS Starter/Growth, Enterprise quote).
- Entitlement model + preview redaction.
- Document retention metadata (`DOCUMENT_RETENTION_DAYS`).
- Broad server audit event recording.

**Assumptions**
- Support will be handled via owner email/Slack out-of-band.
- Pilot customers accept invitation-only access.

**Gaps**
- **No Terms of Service or Privacy Policy pages** in the web app.
- Automated retention **purge not implemented** (README explicit).
- No in-product support/status/ticket surface.
- No AI/usage cost budgets beyond timeouts/retries.

---

## 2. Verified capabilities versus assumptions

| Capability | Status | Basis |
|------------|--------|-------|
| Confirmed-only diagnostics | **Verified** | P0-A live staging |
| Historical integrity demotion | **Verified** | P0-A (+ P0-B fixture) |
| Unpaid PDF deny / paid PDF allow | **Verified** | P0-B live staging |
| Mock settle → entitlement (staging) | **Verified** | P0-B |
| Cross-tenant isolation | **Verified** | P0-B negatives |
| Production mock payment isolation (code) | **Verified** | env tests + runtime 404 |
| Live Korapay charge lifecycle | **Assumption** | Code + unit/integration; not live-accepted |
| Chargeback handling | **Missing** | — |
| Browser UX acceptance | **Assumption / manual** | Explicit limitation in P0-A/B |
| Terms/Privacy | **Missing** | No routes |
| Retention purge | **Missing** | Documented deferral |
| Monitoring/alerting | **Missing** | Health only |
| Backup restore proven | **Assumption** | Runbook mentions backup; no drill evidence |
| Live AI narratives | **Assumption** | Staging AI blocked/optional |

---

## 3. P0 blockers to production

Must close (or formally waive with compensating control) before collecting real customer money or opening public signup:

1. **Live payment acceptance** — Staging (or sandbox) Korapay `sk_test_` path: initialize → hosted checkout → signed webhook → verify → fulfill → PDF; plus refund revoke smoke.
2. **Legal surfaces** — Publish Terms of Service and Privacy Policy; link from register/checkout/footer.
3. **Production secrets & isolation** — Separate prod Postgres/Redis/R2/secrets; `APP_ENV=production`, `PAYMENT_PROVIDER=korapay`, `sk_live_` only after KYC; mock forbidden at boot.
4. **Owner browser walkthrough** of unlock/checkout/download on the target environment (staging with test keys, then prod smoke with ₦0/test if available).
5. **Minimum ops** — Alerting on API/worker unhealthy + failed payment webhooks; named incident owner; documented rollback IDs.

---

## 4. P1 items for limited pilot

Required for a safe **invitation-only** pilot (can proceed in parallel with first invited orgs if P0 closed):

1. Chargeback/dispute runbook + entitlement freeze/revoke path (even if manual ops initially).
2. Payment reconciliation checklist (daily: Korapay settlements vs `Payment`/`Purchase` rows).
3. Support intake channel + response SLA for pilot cohort.
4. Backup restore drill (document time-to-restore).
5. Disable or protect Swagger in production.
6. Security headers (CSP/HSTS/frame deny) at app or edge.
7. Live OpenAI config + grounding soak on 2–3 real statements.
8. Retention policy communication (even without automated purge).
9. ClamAV/production mail (Resend) confirmation on prod project.

---

## 5. P2 post-launch improvements

1. Automated browser E2E (Playwright) for auth → unlock → download.
2. Automated retention purge job + legal hold exceptions.
3. Productized DLQ / failed-job console.
4. Async PDF render (decouple from publish request).
5. Customer-readable audit/activity log.
6. AI/token cost budgets and rate limits per org.
7. Provider settlement reconciliation job.
8. Native subscription mandates if/when Korapay Direct Debit is approved.
9. Increment C taxonomy coverage expansion (deferred by program decision).

---

## 6. Recommended implementation order

```
PR-0 (this assessment) ──► owner decision
        │
        ▼
PR-1 Legal + ops baseline
        • Terms / Privacy pages + footer/register links
        • Support channel + incident owner
        • Monitoring/alerts on health + webhook failures
        • Prod project isolation checklist
        │
        ▼
PR-2 Live payments (sandbox then prod)
        • Korapay sk_test_ staging acceptance
        • Webhook + refund revoke proof
        • Chargeback ops playbook (manual OK initially)
        • Reconciliation checklist
        │
        ▼
PR-3 Pilot harden
        • Browser walkthrough sign-off
        • Swagger lockdown / security headers
        • Backup restore drill
        • OpenAI soak (if narratives promised)
        │
        ▼
Controlled pilot (invitation-only)
        │
        ▼
PR-4 Post-launch (P2 list) + Increment C when authorized
```

---

## 7. Go / no-go criteria for a controlled production pilot

### GO (invitation-only pilot) when all are true

| # | Criterion |
|---|-----------|
| G1 | Separate production Railway project with unique DB/Redis/R2/secrets |
| G2 | `APP_ENV=production`, `PAYMENT_PROVIDER=korapay`, live keys after KYC; mock rejected at boot |
| G3 | Korapay sandbox acceptance recorded (charge + webhook + refund revoke) |
| G4 | Terms + Privacy published and linked from signup/checkout |
| G5 | Owner browser sign-off on unlock → pay → download |
| G6 | Alerts exist for API/worker down and repeated webhook verification failures |
| G7 | Named pilot customers (N small), invitation-only; no public self-serve ads |
| G8 | Rollback images identified; migration backup taken before first prod migrate |
| G9 | Support channel published to pilot users |

### NO-GO if any are true

| # | Condition |
|---|-----------|
| N1 | Attempting public/unrestricted signup without Terms/Privacy |
| N2 | Collecting live payments without sandbox acceptance + webhook proof |
| N3 | Production still runnable with `PAYMENT_PROVIDER=mock` |
| N4 | Shared staging DB/buckets/secrets with production |
| N5 | No human owner for payment disputes / incidents |
| N6 | Financial integrity regressions (PENDING amounts in authoritative scores) |

### Explicit waivers (pilot-only, owner-signed)

May remain open **only** with written owner acceptance:

- Automated browser E2E
- Automated retention purge
- Chargeback automation (manual freeze OK)
- Live AI narratives (disclose limitations / mock AI)
- Increment C taxonomy completeness

---

## Bottom line

P0-A and P0-B removed the **financial integrity** and **staging commercial entitlement** launch blockers. Opero is **architecturally close** to a limited pilot, but **not yet operationally ready** for production money or public signup until live payments, legal pages, and minimum monitoring/ops are closed.

**Recommendation:** Treat the next program increment as **PR-1/PR-2 (legal + live payments + ops)**, not Increment C.

---

## Stop

Read-only assessment complete. No application code, database, push, deploy, or production configuration changes. Increment C not started. Awaiting owner review.
