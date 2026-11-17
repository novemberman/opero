# M2-P0 WEB PRODUCTION RELEASE REPORT

**Date:** 2026-11-17  
**Verdict: BLOCKED**  
**Authorization:** `AUTHORIZE OPERO CONFIRM-UX PRODUCTION DEPLOY` (received)

| Item | Value |
|------|--------|
| Approved release tip | `e7e41b7c4aca392ad882459b14d7d4310c0d00cf` |
| Behavior commit | `86dc4b2d0eb55dfe66ba4573c7b3fd324913a77a` |
| Local `HEAD` at stop | `e7e41b7c4aca392ad882459b14d7d4310c0d00cf` (matches approved tip) |
| Cached `origin/main` | `bc1567a70c54a16c776390f887d8ca9cb8636859` |
| GitHub remote SHA | **UNVERIFIED / NOT UPDATED** — push not executed |
| Rehearsal deployment | **NOT STARTED** |
| Production deployment | **NOT STARTED** |

No production web/API/worker deploy. No migrations. No env changes. No financial confirmations. No payments/uploads/checkout activation.

---

## Phase 1 — GitHub

| Check | Result |
|-------|--------|
| Local tip equals approved SHA `e7e41b7…` | **PASS** |
| Branch not diverged behind origin (local count `0 ahead-left / 10 ahead-right` vs cached origin) | **PASS** (ahead only; not behind) |
| Tip after behavior commit is documentation-only | **PASS** — only `M2-P0-FINAL-RELEASE-VERIFICATION.md` and `M2-P0-WEB-RELEASE-READY.md` between `86dc4b2` and `e7e41b7` |
| Secrets / credential filenames in release range | **PASS** — none detected |
| Unrelated untracked phase-9 docs / `test-results` | Present in working tree; **not** part of release commits; left unstaged |
| `git fetch` / `git push` to `git@github.com:novemberman/opero.git` | **FAIL** — SSH authentication |

### SSH failure evidence

- Configured identity: `~/.ssh/opero_github_ed25519` (`opero-hetzner-github`)
- Fingerprint: `SHA256:J8Z3XPY20MouLfU4oKJDeZKkip65f8WxMCRhGMrnvnQ`
- GitHub **accepts** the public key offer, then signing fails because the private key is **passphrase-encrypted** (`aes256-ctr` / bcrypt) and this session cannot open `/dev/tty` for passphrase entry / no `ssh-agent` with an unlocked key / no `GH_TOKEN`.
- Result: `Permission denied (publickey)`.

**STOP condition met:** “STOP if … SSH authentication fails.”

Phases 2–5 were not executed.

---

## Phase 2 — Isolated rehearsal

| Item | Status |
|------|--------|
| Rehearsal web deploy | **NOT STARTED** |
| Rehearsal deployment ID | n/a |
| Browser acceptance (Confirm / CSRF / CONFIRMED / 401 / PENDING / duplicate-click) | **NOT RUN** in this gate (prior local Docker Chromium was 3/3 PASS on packaging tip; not re-run against a rehearsal deploy) |
| Rehearsal API/worker unchanged | n/a (no deploy attempted) |

---

## Phase 3 — Production preflight

**NOT EXECUTED** (blocked at Phase 1). Prior packaging-era read-only checks are **not** re-certified here.

---

## Phase 4 — Production web promotion

**NOT EXECUTED.** `opero-prd-web` was not redeployed. API/worker untouched by this attempt.

---

## Phase 5 — Production acceptance

**NOT EXECUTED.**

| Expected evidence | Status |
|-------------------|--------|
| GitHub remote SHA | Blocked |
| Rehearsal deployment ID and status | Blocked |
| Browser acceptance results | Blocked (this gate) |
| Production deployment ID and status | Blocked |
| Production health | Not re-checked this gate |
| Financial confirmation count | Not re-checked this gate |
| API/worker isolation | Vacuous PASS (no prod deploy) |
| Upload/checkout controls | Not re-checked this gate |
| Report/payment/entitlement counts | Not re-checked this gate |

---

## Rollback

Not required — no web deployment was mutated.

Emergency shutdowns were not altered.

---

## Remaining blockers

1. **Unlock GitHub SSH for this host** — load `opero_github_ed25519` into `ssh-agent` with the passphrase (interactive owner session), **or** restore non-interactive GitHub auth (deploy key without passphrase / machine token via `gh auth` — owner-managed).
2. Re-run from Phase 1: `git fetch` → confirm origin not diverged → `git push` (no force) → verify `origin/main == e7e41b7…`.
3. Then continue Phase 2 rehearsal web-only → Phase 3 preflight → Phase 4 `opero-prd-web` only → Phase 5 acceptance + update this report to PASS/FAIL.

---

## Verdict

**BLOCKED** at GitHub push authentication. Production remains on prior web SHA (`f59e65e…` last documented). Approved local tip `e7e41b7…` is intact and unpushed.

**STOP FOR OWNER REVIEW.**
