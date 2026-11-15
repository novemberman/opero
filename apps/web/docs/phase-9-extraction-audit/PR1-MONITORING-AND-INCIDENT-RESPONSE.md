# PR-1 Monitoring & Incident Response Plan

**Status:** Design + staging-verifiable hooks. **No external alert recipients configured.**  
**Date:** 2026-11-15

---

## 1. Signals (staging-verifiable)

| Signal | How to observe | Staging check |
|--------|----------------|---------------|
| API availability | `GET /api/v1/health` → `status: ok` | Curl staging API |
| Database connectivity | `GET /api/v1/ready` → `checks.database=ok` | Ready probe |
| Redis connectivity | Ready + `GET /api/v1/ops/status` → `checks.redis` | Ready / ops |
| Worker processing failures | Ops `queues.*.failed` rising; worker Railway logs | Trigger failing job in staging |
| Failed document scans | Document status / audit `document.*`; scanner errors in worker logs | Upload EICAR in staging (existing tests) |
| Extraction failures | Document processing job failed; logs | Bad PDF fixture |
| Payment webhook failures | Billing audit / payment events; API error logs on webhook route | Mock/staging webhook |
| Report generation failures | `queues.reports.failed`; report status | Force render error |
| Storage errors | Ready `checks.storage=fail`; API 5xx on upload/download | Misconfigure bucket in non-prod only |

**New endpoint:** `GET /api/v1/ops/status` — non-secret config snapshot, dependency checks, BullMQ depths. Safe for uptime scrapers.

---

## 2. Severity model

| Severity | Definition | Examples |
|----------|------------|----------|
| **SEV-1** | Customer-facing outage or payment integrity risk | API down; checkout granting without pay; prod mock payments |
| **SEV-2** | Major degradation | Redis down (jobs stuck); R2 auth failure; webhook backlog |
| **SEV-3** | Partial feature failure | Single queue failed spike; AI provider timeout |
| **SEV-4** | Informational | Elevated latency; non-critical log noise |

---

## 3. Escalation & ownership (placeholders)

Do **not** invent pager emails. Owner must approve:

| Role | Placeholder | Responsibility |
|------|-------------|----------------|
| Primary on-call | `[ONCALL_PRIMARY_CONTACT]` | Ack SEV-1/2 within agreed SLA |
| Secondary | `[ONCALL_SECONDARY_CONTACT]` | Backup if primary unavailable |
| Billing/payments | `[BILLING_INCIDENT_OWNER]` | Korapay / entitlement disputes |
| Security | `[SECURITY_INCIDENT_OWNER]` | Credential leak, abuse |
| Communications | `[CUSTOMER_COMMS_OWNER]` | Pilot customer notices |

**Escalation ladder (draft)**

1. Detect (uptime / ops scrape / human report).
2. Acknowledge in `[INCIDENT_CHANNEL_PLACEHOLDER]`.
3. Mitigate (see emergency switches).
4. Resolve + write short postmortem for SEV-1/2.

---

## 4. Emergency disable switches (implemented)

| Env flag | Effect |
|----------|--------|
| `EMERGENCY_DISABLE_CHECKOUT=true` | Blocks new checkouts (`EMERGENCY_DISABLE_CHECKOUT`) |
| `EMERGENCY_DISABLE_UPLOADS=true` | Blocks new document uploads |

Set via Railway variables; redeploy/restart API. Clear to restore. Prefer these over deleting services during incidents.

Additional future switches (not implemented): disable AI, disable PDF download — track as follow-ups.

---

## 5. Suggested external monitors (owner configures)

1. HTTP 200 on `/api/v1/health` every 60s.
2. HTTP 200 on `/api/v1/ready` every 2–5 min.
3. JSON assert on `/api/v1/ops/status`: `status=ok`, `queues.*.failed` below threshold.
4. Railway CPU/memory/restart alerts per service.
5. Separate monitor set for **production** vs **staging**.

Notification targets: only after owner fills placeholders above.

---

## 6. Staging verification script (manual)

```bash
# Replace with staging API origin
API=https://<staging-api>
curl -fsS "$API/api/v1/health" | jq .
curl -fsS "$API/api/v1/ready" | jq .
curl -fsS "$API/api/v1/ops/status" | jq '{status,appEnv,paymentProvider,checks,queues,emergency,pilot}'
```

Expect staging: `paymentProvider` may be `mock`; `apiDocsEnabled` true unless overridden.
