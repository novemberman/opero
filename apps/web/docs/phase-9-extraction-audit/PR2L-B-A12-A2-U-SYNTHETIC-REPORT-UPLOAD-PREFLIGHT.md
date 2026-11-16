# PR-2L-B A12-A2-U — Synthetic report upload preflight

**Date:** 2026-11-16  
**Mode:** READ-ONLY production upload safety assessment  
**Pilot org:** `opero-live-pilot` (`6693e901-9051-49bc-82a6-20094835432c`)  
**Pilot email:** `pilot@opero.coworkxspace.com`  
**Parent:** A12-A1 identity **PASS**

### Restrictions honored

- No uploads enabled  
- No reports created  
- No deploy / push / variable changes  
- No payments / webhooks  
- Staging / rehearsal untouched  
- Secret values not printed  

---

## Assessment

### **PASS* — timed upload window is operationally feasible; exclusive org lock needs code**

| # | Question | Verdict |
|---|----------|---------|
| 1 | Upload kill switch + org auth | **PASS** — global `EMERGENCY_DISABLE_UPLOADS`; org routes gated by session + membership + `xray:write` |
| 2 | Uploads exclusive to pilot org? | **FAIL (config-only)** — kill switch is **global**; no org allowlist exists today |
| 3 | ClamAV / storage wiring | **PASS*** — ClamAV online; scanner=`clamav`; ready storage **ok** |
| 4 | Quarantine/reports → documents bucket | **WARN** — intentional A11-S1c residual; prefix isolation only |
| 5 | Timed upload window enforceable? | **PASS (ops)** — manual flip; **no** automatic expiry in code |
| 6 | Synthetic report via normal pipeline | **PASS (design)** |
| 7 | No payment / entitlement issued | **PASS** — keep checkout/live-pilot off; report create ≠ grant |
| 8 | Smallest safe change | Ops window **or** small allowlist code (recommended) |
| 9 | Rollback / monitoring / shutdown | Documented below |
| 10 | Owner authorization needed | **Yes** — see §10 |

\*Safe **only** while production remains a **single-tenant** surface (currently **1** org / **1** user) **or** after an allowlist code deploy.

**Do not** enable uploads under this preflight.

---

## 1. Upload kill switch and organization authorization

| Control | Production observation | Code behavior |
|---------|------------------------|---------------|
| `EMERGENCY_DISABLE_UPLOADS` | **`true`** on `opero-prd-api` and `opero-prd-worker` | First check in `DocumentsService.createUpload` → **400** `EMERGENCY_DISABLE_UPLOADS` |
| Ops effective flag | `emergency.disableUploads=true` | From `/ops/status` |
| Route guards | Session + `OrgMembershipGuard` + `PermissionsGuard` | `POST …/documents/uploads` requires `xray:write` |
| OWNER permissions | Pilot is **OWNER** | Has `xray:write` |
| Storage key binding | `org/{organizationId}/docs/…` | Rejects keys outside org prefix on complete |

Worker note: kill switch is set on worker env for posture consistency; **upload initiation** is enforced on the API. Worker processes quarantine → scan → promote using bucket env vars.

---

## 2. Can uploads be restricted exclusively to the pilot organization?

| Approach | Exclusive to pilot? | Available now? |
|----------|---------------------|----------------|
| Keep `EMERGENCY_DISABLE_UPLOADS=true` | N/A (all blocked) | **Yes** |
| Set `EMERGENCY_DISABLE_UPLOADS=false` globally | **No** — any future org with `xray:write` could upload | **Yes** (unsafe if multi-tenant) |
| Rely on “only one org exists” | **De facto yes today** (users=1, orgs=1) | **Yes, fragile** |
| New env e.g. `UPLOAD_ALLOWLIST_ORG_ID` / `UPLOAD_WINDOW_EXPIRES_AT` | **Yes** | **No** — requires code + deploy |

**Conclusion:** Config alone cannot hard-restrict uploads to `opero-live-pilot`. For A2-U, either:

- **A2-U-OPS:** short global window while asserting single-tenant counts before/during/after, or  
- **A2-U-CODE (recommended):** add allowlist + optional window expiry, deploy API (worker unchanged if check is API-side only), then open window.

---

## 3. ClamAV and storage configuration

| Component | Status |
|-----------|--------|
| `opero-prd-clamav` | **Online** |
| `DOCUMENT_SCANNER_DRIVER` | `clamav` (api + worker) |
| `CLAMAV_HOST` | `opero-prd-clamav.railway.internal:3310` |
| `DOCUMENT_STORAGE_DRIVER` | `s3` |
| `S3_ENDPOINT` | `https://t3.storageapi.dev` |
| Ready check `storage` | **ok** |
| Documents queue | waiting/active/failed = **0** |
| Current docs / uploads / reports | **0 / 0 / 0** |

Railway bucket **services** present: `opero-prd-documents`, `opero-prd-quarantine`, `opero-prd-reports`.

---

## 4. Quarantine / reports variables → documents bucket

| Variable (api + worker) | Value |
|-------------------------|-------|
| `S3_DOCUMENTS_BUCKET` | `opero-prd-documents-j-hcdi` |
| `S3_QUARANTINE_BUCKET` | `opero-prd-documents-j-hcdi` (**same**) |
| `S3_REPORTS_BUCKET` | `opero-prd-documents-j-hcdi` (**same**) |
| Credentials | Referenced from **`opero-prd-documents`** bucket service (A11-S1c) |

### Isolation / security impact

| Risk | Assessment |
|------|------------|
| Cross-bucket separation | **Absent** — quarantine, clean docs, and reports share one physical bucket |
| Object isolation | **Prefix-based** — `org/<orgId>/docs/…` enforced in upload complete / worker paths |
| Same-bucket promote | Worker copy quarantine→documents becomes same-bucket key copy (still valid) |
| Credential blast radius | One access key covers all three logical roles |
| A11-S1c stance | Explicit residual: quarantine/reports mapping **not** changed during documents rotation |

**For A2-U:** Acceptable as **WARN** for a single synthetic Opero-owned file under a timed window, because:

- Only the pilot org exists  
- Keys remain org-scoped  
- Checkout remains disabled  

**Not** a substitute for eventual remapping of `S3_QUARANTINE_BUCKET` / `S3_REPORTS_BUCKET` to `opero-prd-quarantine` / `opero-prd-reports` with matching credential refs (separate authorize).

**Do not** treat shared-bucket as blocking A2-U if owner accepts the WARN and window discipline.

---

## 5. Timed upload window

| Mechanism | Exists? |
|-----------|---------|
| Automatic upload TTL kill switch | **No** |
| Per-upload session TTL | **Yes** (presign/upload row expiry; unrelated to global kill switch) |
| Ops procedure window | **Yes** — set `false` → work → set `true` on **api and worker** |

Safe window properties:

1. Pre-check: orgs=1, users=1, checkout still on, live pilot unset  
2. Duration: minutes, not hours; owner present  
3. Immediate shutdown: `EMERGENCY_DISABLE_UPLOADS=true` (api+worker), confirm ops `disableUploads=true`  
4. No second org / invite issuance during the window  

---

## 6. Synthetic report design (normal pipeline)

**Goal:** one Opero-owned synthetic financial package → one `xray_reports` row for future `LIVE_PILOT_REPORT_ID` (Authorize C later).

| Step | Action |
|------|--------|
| 1 | Owner signs in as pilot |
| 2 | Upload **one** synthetic PDF/XLSX (Opero labels only; no customer data) while window open |
| 3 | Wait ClamAV clean + extraction/diagnostics success |
| 4 | `POST /organizations/{pilotOrgId}/reports` with `diagnosticRunId` |
| 5 | Submit review → approve → publish as needed for pilot checkout binding |
| 6 | Record `report.id` offline for later allowlist |
| 7 | Close upload window **before** any payment authorization |

Content rules: synthetic statements only; filename like `LIVE_PILOT_SYNTHETIC.*`; no real customer PII/financials.

---

## 7. Payment / entitlement confirmation

| Path | Issues payment? | Issues entitlement? |
|------|-----------------|---------------------|
| Document upload / process | **No** | **No** |
| Diagnostic run | **No** | **No** |
| Report create / review / publish | **No** | **No** (create does not grant commercial access) |
| PDF download / full unlock | May **check** entitlement | Does **not** create payment if checkout disabled |
| Live-pilot / XRAY_PRO checkout | Blocked while kill switch / pilot off | — |

**Keep throughout A2-U:**

```text
EMERGENCY_DISABLE_CHECKOUT=true
LIVE_PILOT_ENABLED=<unset/false>
PUBLIC_REGISTRATION_ENABLED=false
```

Expected post-A2-U counts: payments=0, intents=0, grants=0; reports≥1; docs≥1.

---

## 8. Smallest safe configuration or code change

### Option 1 — Smallest **config-only** (A2-U-OPS)

1. Snapshot counts + flags.  
2. `EMERGENCY_DISABLE_UPLOADS=false` on `opero-prd-api` and `opero-prd-worker` (no other vars).  
3. Confirm ops `disableUploads=false`; single-tenant still holds.  
4. Owner completes §6 pipeline.  
5. Immediately set `EMERGENCY_DISABLE_UPLOADS=true` on both; confirm.  

**Pros:** no deploy. **Cons:** not org-exclusive; relies on single-tenant + discipline.

### Option 2 — Smallest **hardening code** (A2-U-CODE, recommended before multi-tenant)

Add API-side checks in `createUpload` (and optionally complete):

- `UPLOAD_ALLOWLIST_ORG_ID=<pilot org uuid>` must match  
- Optional `UPLOAD_WINDOW_EXPIRES_AT=<ISO-8601>` must be in the future  
- Still require `EMERGENCY_DISABLE_UPLOADS=false` to open  

Deploy **API only** (worker may keep processing). Then run Option 1 window with allowlist set.

**Pros:** exclusive to pilot org. **Cons:** needs commit + API deploy authorize.

### Out of scope for “smallest” A2-U

- Remapping quarantine/reports buckets (separate storage authorize)  
- Enabling checkout / live pilot  
- SQL report seed  

---

## 9. Rollback, monitoring, immediate shutdown

### Immediate upload shutdown

```bash
# Conceptual — owner-authorized execute only
railway variable set EMERGENCY_DISABLE_UPLOADS=true -s opero-prd-api -e production
railway variable set EMERGENCY_DISABLE_UPLOADS=true -s opero-prd-worker -e production
# confirm:
# GET /ops/status → emergency.disableUploads=true
# POST upload → 400 EMERGENCY_DISABLE_UPLOADS
```

If variables require restart: redeploy api/worker **same SHAs** only if needed — prefer `--skip-deploys` + confirm runtime pick-up per Railway behavior, or explicit same-SHA redeploy under execute auth.

### Rollback of data

- Leave synthetic doc/report in place (needed for later pilot).  
- Or soft-delete document per product tools if aborting A2 entirely.  
- **Do not** drop buckets or rotate credentials in emergency upload shutdown.

### Monitoring during window

| Signal | Watch |
|--------|-------|
| `/ops/status` | `disableUploads`, document queue depths, failed jobs |
| API/worker health | 200 / online |
| ClamAV | service online; scan failures |
| DB counts | orgs must stay **1**; payments/grants stay **0** |
| UptimeRobot / Railway | crash/deploy alerts (Activate residual still owner-pending) |

Stop window immediately if: second org appears, payment row appears, scan failure storm, or storage ready fails.

---

## 10. Exact execution plan and required owner authorization

### Proposed sequence (after authorize)

1. **Pre-window checks** (read-only): flags, counts, PITR, clamav, ready.  
2. Choose **A2-U-OPS** or **A2-U-CODE** path.  
3. Open upload window (and allowlist if CODE).  
4. Owner uploads one synthetic file; wait for clean processing.  
5. Create + progress report through normal APIs.  
6. Capture `report.id`.  
7. Close upload window; verify kill switch effective.  
8. Safety recount: payments/grants=0; checkout still on; live pilot unset.  
9. Write A12-A2-U execution report; **STOP** (no Authorize C).

### Suggested owner replies

| Reply | Meaning |
|-------|---------|
| `AUTHORIZE A12-A2-U-OPS TIMED UPLOAD WINDOW` | Config-only window; accept single-tenant + shared-bucket WARN |
| `AUTHORIZE A12-A2-U-CODE ALLOWLIST THEN WINDOW` | Implement/deploy allowlist first, then window |
| `HOLD A12-A2-U` | Do nothing |
| `AUTHORIZE A12-STORAGE BUCKET SPLIT` | Separate optional work before/after A2-U |

### Explicitly not requested yet

- Checkout / `LIVE_PILOT_ENABLED`  
- Korapay charges / webhooks  
- Staging/rehearsal changes  
- Increment C  

---

## Current production snapshot (this preflight)

| Item | Value |
|------|-------|
| API | `af0dd97b…` |
| Web | `f59e65e…` |
| Worker | `31749a3…` |
| Uploads kill switch | **true** |
| Checkout kill switch | **true** |
| Live pilot | unset/false |
| Orgs / users / reports / payments / grants | **1 / 1 / 0 / 0 / 0** |

---

## STOP FOR OWNER REVIEW

**Completed:** read-only upload safety assessment, shared-bucket WARN, timed-window design, synthetic report pipeline plan, authorization options, this report.

**Not done:** enabling uploads, creating reports, deploys, variable changes, payments.
