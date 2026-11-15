# PR-1 Pilot Access Control Design

**Status:** Implemented behind env flags. **Defaults preserve current staging/dev behavior** (public registration on).  
**Do not enable public registration or live billing for production pilot without owner approval.**

---

## 1. Goals

- Invitation-only production pilot.
- Caps on organizations and users.
- Feature / kill switches for emergency response.
- Controlled onboarding without mandatory legal clickwrap until counsel approves final text.

---

## 2. Environment controls

| Variable | Default | Production pilot recommendation |
|----------|---------|----------------------------------|
| `PILOT_MODE` | `false` | `true` |
| `PUBLIC_REGISTRATION_ENABLED` | `true` | `false` (required when `PILOT_MODE=true` in production) |
| `PILOT_INVITE_CODE` | unset | Optional shared bootstrap code for `/auth/register` |
| `PILOT_MAX_ORGANIZATIONS` | unset | e.g. `10`–`25` |
| `PILOT_MAX_USERS` | unset | e.g. `50`–`100` |
| `EMERGENCY_DISABLE_CHECKOUT` | `false` | `false` unless incident |
| `EMERGENCY_DISABLE_UPLOADS` | `false` | `false` unless incident |

Env validation rejects `PILOT_MODE=true` + `PUBLIC_REGISTRATION_ENABLED=true` in **production**.

---

## 3. Onboarding paths

| Path | When registration disabled | Notes |
|------|----------------------------|-------|
| `/auth/register` | Blocked (`PUBLIC_REGISTRATION_DISABLED`) | Optional `inviteCode` when `PILOT_INVITE_CODE` set |
| Organization invitation accept | **Allowed** | Can create user + membership; preferred pilot path |
| Operator seed / SQL | Manual break-glass | Document in runbook if used |

**Controlled onboarding workflow (recommended)**

1. Operator creates first owner account (invite code or temporary registration window).
2. Owner creates organization (subject to `PILOT_MAX_ORGANIZATIONS`).
3. Owner invites members by email.
4. Members accept invitation; no public signup page needed.

---

## 4. Pilot feature flags (product)

| Flag / behavior | State for pilot |
|-----------------|-----------------|
| Public marketing register CTAs | Leave visible but API rejects if disabled; optional later UI hide |
| Live Korapay | **Off** until Increment C / owner go-live |
| Mock settle | Staging only; 404 in production |
| AI provider | Staging config; production only with approved key |
| Legal draft links | Visible; **no** mandatory checkbox until final counsel text |

---

## 5. Emergency disable

See monitoring plan. Toggle Railway env → restart API:

- Stop new paid unlocks: `EMERGENCY_DISABLE_CHECKOUT=true`
- Stop new uploads: `EMERGENCY_DISABLE_UPLOADS=true`

Existing sessions and already-granted entitlements remain (read path) unless separately revoked.

---

## 6. Support escalation workflow (draft)

1. Pilot customer emails `[SUPPORT_CONTACT_PLACEHOLDER]`.
2. Triage: access / billing / document / report / security.
3. SEV-1/2 → on-call placeholders in monitoring plan.
4. Billing disputes → `[BILLING_SUPPORT_EMAIL_PLACEHOLDER]` + Korapay dashboard (production only when live).
5. Data deletion requests → `[PRIVACY_REQUEST_EMAIL_PLACEHOLDER]` (manual until purge job exists).

Do not publish these placeholders as real addresses.

---

## 7. Owner decisions required

1. Pilot org/user caps.
2. Whether to use `PILOT_INVITE_CODE` vs org-invite-only.
3. Support / on-call contact list.
4. When to flip `PUBLIC_REGISTRATION_ENABLED=false` on staging for rehearsal.
5. Approval of final legal text before any mandatory consent UI.
