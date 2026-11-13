# Opero agent handoff

Date: 2026-11-13 (Phase 7B-1 infrastructure foundation implemented locally — awaiting owner review)
Workspace: `/home/opero/projects/opero`
Branch: `main`
Remote: private GitHub repository `novemberman/opero` (`git@github.com:novemberman/opero.git`)
Approved baseline: `364cc14` (Phase 7A). Phase 7B-1 remains **uncommitted**.
Phase: **Phase 7B-1** cloud infrastructure & deployment foundation. **Do not commit/push/deploy until owner approves.**

## Phase status

| Phase | Status |
| --- | --- |
| Phase 6 / 6B / 6C AI reports + publication integrity | in `364cc14` ancestry |
| Phase 7A Nigerian commercialization (Korapay) | `364cc14` |
| Phase 7B-1 Railway deployment foundation | Implemented locally — no commit yet |

## Phase 7B-1 notes

| Area | Status |
| --- | --- |
| Dockerfiles | `deploy/docker/Dockerfile.{web,api,worker}` |
| Railway map | `deploy/railway/services.json` |
| Migrations | `scripts/migrate-deploy.mjs` (advisory lock) |
| Storage | S3 SSE + integrity; MinIO compose profile; prod forbids FS |
| Env guards | staging/production safety in API + worker |
| Docs | `docs/PHASE7B1_DEPLOYMENT.md` + `docs/runbooks/*` |

### Residual / owner-gated

- Railway account, paid plugins, custom domains
- Managed S3 credentials
- Staging deploy (not performed)
- GitHub SSH push access on this host
- Live payments / Phase 7B-2

## Exact next steps (owner-gated)

1. Review Phase 7B-1 completion report; approve commit when ready.
2. Provision Railway staging + private storage before any deploy.
3. Do not process live payments or start Phase 7B-2 until approved.
