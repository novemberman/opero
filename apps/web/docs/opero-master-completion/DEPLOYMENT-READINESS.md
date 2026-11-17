# Deployment Readiness (M10 partial)

**Date:** 2026-11-17  
**Local implementation ready for rehearsal candidate:** Conditional — after CI green on Confirm UX commit.

## Current production

| Service | Commit |
|---------|--------|
| API | `bc1567a70c54a16c776390f887d8ca9cb8636859` |
| Web | `f59e65e6f220f96f58d08868a75aaa4d91bc384a` |
| Worker | `31749a375ae5d7a89a66fc6dba05636988429ce3` |

Migrations applied in production: **14** (no new migration in this Confirm UX change).

## Deploy plan (requires owner authorize)

1. Merge/push local completion commit(s) after owner review.  
2. Deploy **web + api** together (worker optional if unchanged).  
3. Set `APP_VERSION` to deploy SHA on all services.  
4. Smoke: `/ready`, login, open pilot document, one-figure Confirm diagnostic.  
5. Keep emergencies **ON** until separate authorize.  

## Rollback

- Redeploy previous Railway successful deployments for web/api.  
- No DB migration rollback required for this change set.  
- Confirmed figures (if any post-deploy) remain valid data — do not delete reviews.

## Monitoring

- API request logs for `POST …/review`  
- Audit `document.reviewed` counts  
- Error rate / CSRF 403 spikes  

## Cost

No new paid resources provisioned. Stay under USD 235/mo target; Confirm UX has negligible cost impact.
