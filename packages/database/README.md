# @opero/database

Prisma schema and PostgreSQL migrations for the Opero platform.

## Models

- `Organization` — tenant record, unique slug
- `User` — identity with Argon2id `passwordHash` and optional `emailVerifiedAt`
- `Membership` — links a user to an organization with `MembershipRole` (`OWNER`, `ADMIN`, `ANALYST`, `VIEWER`)
- `Session` — opaque server sessions; cookie holds the raw token, database stores `tokenHash`
- `EmailVerificationToken` / `PasswordResetToken` — single-use hashed tokens with expiry
- `OrganizationInvitation` — hashed invite tokens with role, expiry, consume/revoke markers
- `AuditEvent` — append-only security/business events; `organizationId` optional for auth events

Identifiers are UUIDs unless noted. Token plaintext is never stored.

## Tenant isolation

This schema does **not** enforce tenant isolation. Postgres row-level security is **not** enabled in Phase 3.

Relations and indexes make organization scope expressible. They do not stop a query from reading another organization's rows. The NestJS API must derive identity from the server session, verify membership, and scope every tenant query by `organizationId`. Those rules must be tested. Do not treat a client-supplied organization id as authorization.

`AuditEvent` uses `onDelete: Restrict` for the organization so deleting a tenant cannot silently discard history when an org id is present. That is referential integrity, not an access-control policy.

Future X-Ray resources (documents, scores, plans) must include a non-null `organizationId` foreign key and reuse the same membership/permission guards.

## Commands

From the repository root, with `.env` present:

```bash
pnpm db:generate
pnpm db:migrate
```

`pnpm db:migrate` runs `prisma migrate deploy`. It applies committed migrations and does not reset the database.

To author a new migration against a development database:

```bash
pnpm --filter @opero/database exec prisma migrate dev --name <description>
```

Review the generated SQL before applying it. `migrate dev` can ask to reset a database when it detects drift. Do not reset a database that contains anything you need to keep.
