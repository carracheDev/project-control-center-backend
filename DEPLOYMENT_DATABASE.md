# Render and Neon database URLs

Render must expose two database variables:

- `DATABASE_URL`: Neon pooled URL for the running NestJS application.
- `DIRECT_URL`: Neon direct, non-pooled URL for Prisma migrations.

The Prisma datasource uses `DATABASE_URL` for runtime queries and `DIRECT_URL` for `prisma migrate deploy`. The direct URL must use the same database, branch and credentials as the pooled URL, but its hostname must not contain `-pooler`.

In Render, configure `DIRECT_URL` from Neon’s **Direct connection** string, then redeploy. Do not run `prisma migrate deploy` concurrently from multiple Render deploys. The `npm audit` vulnerability count in the build log is separate from the `P1002` migration failure.