# @opero/database

Prisma schema and PostgreSQL migrations for the Opero platform foundation.

## Models

- `Organization` — tenant record, unique slug
- `User` — global identity (email and display name only; no credentials in this phase)
- `Membership` — links a user to an organization with an explicit `MembershipRole` (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`)
- `AuditEvent` — append-only, organization-scoped event

Identifiers are UUIDs. `Organization`, `User`, and `Membership` store `createdAt` and `updatedAt`. `AuditEvent` stores `createdAt` only.

## Tenant isolation

This schema does **not** enforce tenant isolation.

Relations and indexes make organization scope expressible. They do not stop a query from reading another organization's rows. Before any business API is exposed, the service layer must constrain reads and writes by `organizationId`, and those constraints must be covered by tests. Do not treat the presence of `organizationId` as an authorization guarantee.

`AuditEvent` uses `onDelete: Restrict` for the organization so deleting a tenant cannot silently discard history. That is referential integrity, not an access-control policy.

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
