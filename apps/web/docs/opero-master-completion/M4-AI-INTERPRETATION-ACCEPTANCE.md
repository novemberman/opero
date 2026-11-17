# M4 AI FINANCIAL INTERPRETATION — ACCEPTANCE

**Date:** 2026-11-17  
**Verdict: PASS** (local; live OpenAI provider **unverified**)  
**Local RC:** `4f7b19361f1cab0fa073b61f8bbdb5e24b00f634`  
**Authorization:** Autonomous local M4+M5 workstream. No push, deploy, production diagnostics/reports, or payments.

| Item | Value |
|------|--------|
| Prompt version | `ai.interpret.v2` |
| Grounding validation | `grounding.v2` (existing pipeline + section coverage) |
| Provider under test | Deterministic `mock` (+ fake live provider in API/worker IT) |
| Live OpenAI / compatible API | **Not exercised** — credential/cost external; architecture provider-neutral |

---

## Scope delivered

### Interpretation sections (`ai.interpret.v2`)

| Section | Behaviour |
|---------|-----------|
| Executive summary | Required; mock builds from computed metrics only |
| Profitability / liquidity / solvency / efficiency / cash-flow | Dimension fields; empty string when no COMPUTED metrics |
| Risks | From findings / restricted-language filtering |
| Recommendations | Only when findings supply suggested actions |
| Data-quality explanation | From quality / excluded dimensions |
| Trend commentary | Only when growth/movement metrics are COMPUTED |
| Claims | Must cite metric codes / finding IDs; grounding strips inventions |

### Reliability controls

- Structured Zod input/output schemas (`packages/ai/src/schema.ts`)
- Prompt versioning (`PROMPT_VERSION = ai.interpret.v2`)
- Mock deterministic fallback when no live provider
- Timeout / retry / error classification retained on OpenAI-compatible port
- Failed AI job does not mutate diagnostic metrics/findings/scores (worker unit + API IT)
- Safe logging / usage seams unchanged; simulated banner required in UI

### Numerical integrity

- AI must not invent values, ratios, periods, industry benchmarks, forecasts, Business Health Scores, or audit assurance
- Grounding rejects unsupported metric codes, invented decimals, and restricted language
- UI copy: diagnostic tables take precedence; simulated labelled explicitly

---

## Test evidence

| Suite | Result |
|-------|--------|
| `@opero/ai` unit | **151/151 PASS** |
| API `ai.integration.test.ts` | Included in AI+reports IT batch **31/31 PASS** |
| Worker `execute-ai-interpretation.test.ts` | **17/17 PASS** |
| Web presentation / narrative / grounding UI | Covered by vitest + Playwright fixture journey |
| Live provider E2E | **SKIPPED** — external credential |

---

## UI

- Narrative panel renders v2 dimension prose + recommendations
- Design-system specimen uses `ai.interpret.v2`
- Report preview surfaces the same dimension fields when present

---

## Remaining external / product blockers

1. Live model cost, keys, and ops verification (owner).
2. Production deploy of API + worker + web packages that consume v2 narrative fields.
3. D-P0-005: `xray.report_generate` still unenforced (product decision).

**STOP FOR OWNER REVIEW** (with M5 / integrated manifest).
