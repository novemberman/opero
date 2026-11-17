# M9 END-TO-END ACCEPTANCE

**Date:** 2026-11-17  
**Verdict: PASS** (isolated synthetic / composable IT + Docker Chromium fixtures)  
**Not claimed:** live Korapay settlement, live OpenAI model ops  

## Synthetic journey map

| Step | Evidence |
|------|----------|
| 1–2 Register / org | `security.integration.test.ts` |
| 3–5 Upload / extract / confirm | `documents.integration.test.ts` (+ prior M2 Confirm) |
| 6 Readiness | `readiness.integration.test.ts` |
| 7–8 Diagnostics / BHS | diagnostics IT + `@opero/diagnostics` |
| 9 AI interpretation | ai IT + mock provider |
| 10 Report generate | reports IT — requires `xray.report_generate` |
| 11–12 Mock billing / entitlement | billing IT |
| 13 Authorized retrieve | PDF 200 after fulfill; FREE_PREVIEW before |
| 14 Cross-tenant denial | billing + reports IT |
| 15 Refund / revocation | billing chargeback/refund IT |
| 16 Emergency shutdowns | checkout emergency + live-pilot a12 IT |

## Browser

Docker `mcr.microsoft.com/playwright:v1.56.1-jammy` · `--network host` · `127.0.0.1:3010` · **5/5 PASS**  
(review-confirm + financial-intelligence design-system specimens).

Full authenticated multi-page Playwright against live API remains deferred (documented residual).
