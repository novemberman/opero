# Production promotion checklist

Promote only a reviewed commit that already passed staging smoke.

1. Confirm Git commit SHA matches staging deployment.
2. Confirm production Railway project uses separate Postgres, Redis, buckets, secrets.
3. Backup production database.
4. Set `APP_ENV=production`, Korapay `sk_live_` only after KYC, `PAYMENT_PROVIDER=korapay`.
5. Run `pnpm migrate:deploy` once (advisory lock).
6. Deploy API → worker → web with the same image/commit.
7. Verify `/api/v1/ready`, webhook signature path, cookie `Secure`, CORS origins.
8. Keep mock payments, filesystem storage, and `MAIL_DRIVER=dev` rejected by startup validation. Staging/production mail must use `MAIL_DRIVER=resend` with `RESEND_API_KEY` and `MAIL_FROM_ADDRESS`.
