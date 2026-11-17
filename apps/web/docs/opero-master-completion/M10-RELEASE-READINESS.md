# M10 RELEASE READINESS

**Date:** 2026-11-17  
**Integrated local RC tip:** `c50fa0e7d4a672d89d5a36169000f46b6d3e35db`  
**Feature code tip (M6–M10):** `3e64963fe2e0688c5e1227d6bb8c9beddfb3649c`  


## Feature-completion inventory

| Milestone | Local status |
|-----------|--------------|
| M1 Audit | COMPLETE |
| M2 Confirm / readiness | COMPLETE (prod API subset live) |
| M3 Diagnostics / BHS | COMPLETE local |
| M4 AI interpretation | COMPLETE local (mock) |
| M5 Reporting | COMPLETE local |
| M6 Billing / entitlements | COMPLETE local mock; live Korapay BLOCKED |
| M7 CX | COMPLETE for billing/members commercial surfaces |
| M8 Security | COMPLETE audit + IT |
| M9 E2E | COMPLETE composable + Docker Chromium |
| M10 Release pack | THIS DOCUMENT |

## Migrations

| Migration | Required on deploy? |
|-----------|---------------------|
| `20261117120000_m6_report_generate_entitlement` | **Yes** (API/worker before enforcing generate on OS plans) |
| Prior 14 | Already on production baseline |

## Deployment dependency graph

1. Apply DB migration  
2. Deploy packages build (`shared` → `ai`/`reports`/`payments`/`diagnostics`)  
3. API (entitlement gate + billing grants)  
4. Worker (integrity-only reports; shared package compat)  
5. Web (billing/members CX + unlock copy)  

**Do not** enable uploads/checkout emergencies off, registration, or live pilot without owner authorize.

## Rollback

1. Redeploy prior service SHAs  
2. Migration inserts are additive (`ON CONFLICT DO NOTHING`) — safe leave-in-place  
3. If generate gate must be relaxed temporarily: revert API `publishInner` check only (not recommended)

## Monitoring plan (rehearsal)

- Checkout start / fulfill / entitlement_denied audit rates  
- Publish 403 ENTITLEMENT_REQUIRED vs 200  
- Webhook signature failures  
- Report PDF integrity failures  
- `/ready` + APP_VERSION stamp per service  

## Cost estimate (rehearsal)

- Mock payments: ₦0  
- Live OpenAI: not required for RC (mock AI)  
- Live Korapay probe: owner-only ₦100 path if pilot gates enabled  

## External dependency register

| Dependency | Status |
|------------|--------|
| Korapay hosted checkout | BLOCKED_EXTERNAL |
| Live OpenAI | BLOCKED_EXTERNAL / optional |
| S3 bucket separation | ACCEPTED_RISK until remap authorize |
| Production kill switches | Intentional ON |

## Rehearsal acceptance plan

1. Deploy RC to isolated rehearsal with mock payments  
2. Run M9 journey with synthetic fixtures  
3. Confirm generate denied without purchase; allowed after mock settle  
4. Confirm FREE_PREVIEW / PDF gates  
5. Owner sign-off before production  

## Production deployment plan

Owner-only. Requires: migration apply, API+worker+web tips aligned, emergencies reviewed, pilot allowlists confirmed, no live payment until Korapay Gate C PASS.

## Customer pilot plan

Continue dormant/emergency posture until Confirm UX + M6 generate gate are deployed and owner re-confirms pilot statement. No unpaid PDF generation after this RC.

## Commercial launch go/no-go

| Criterion | Assessment |
|-----------|------------|
| Local financial intelligence | GO |
| Mock billing integrity | GO |
| Live payment settlement | **NO-GO** until Korapay verified |
| Live AI provider ops | **NO-GO** / optional mock |
| Shared bucket remap | Not required for pilot; ACCEPTED_RISK |
| Overall commercial launch | **NO-GO** — rehearsal-ready, not production-payment-ready |
