# Billing Acceptance (M6)

**Date:** 2026-11-17  
**Local:** `billing.integration.test.ts` included in security/readiness/billing batch → **PASS** (28 tests across 3 files)

## Architecture verified in code

- Product/price catalog  
- Checkout intents  
- Provider mocks  
- Webhook auth + idempotency helpers (`@opero/payments`)  
- Entitlement issuance only after verified settlement path  
- Chargeback / dispute flows (PR2L-A)  
- Emergency checkout disable + live-pilot gates  

## Hard rules (must not weaken)

- Browser “payment success” alone never grants entitlement  
- `EMERGENCY_DISABLE_CHECKOUT=true` in production (revalidated)  
- Live pilot probe payments disabled  

## Owner-action checklist (external)

1. Korapay support response on hosted checkout Gate C failure  
2. Merchant live readiness confirmation  
3. Webhook URL + secret configuration verification  
4. Verified sandbox settlement receipt  
5. Refund / chargeback procedure dry-run  
6. Explicit authorize for controlled live payment  

## Status

| Layer | Status |
|-------|--------|
| B Mock/local | **PASS** |
| E Rehearsal live settlement | **BLOCKED_EXTERNAL** |
| G Production live | **NOT AUTHORIZED** |
