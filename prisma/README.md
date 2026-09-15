# Database environments

Development currently uses SQLite because it keeps local setup simple. Production must use PostgreSQL.

1. Provision a staging PostgreSQL database and set `DATABASE_URL` to its pooled/runtime connection string.
2. Set `DIRECT_URL` to the direct, non-pooled PostgreSQL connection string. Prisma uses this URL for migration advisory locks; with Neon, do not use the `-pooler` hostname for `DIRECT_URL`.
3. Change the Prisma datasource provider from `sqlite` to `postgresql` in a production branch or deployment-specific schema copy.
4. Run `npx prisma validate --schema prisma/schema.prisma` and generate a PostgreSQL migration with `npx prisma migrate dev --name production_baseline` against staging.
5. Run `npx prisma migrate deploy` in production. Never run `migrate reset` against a real database.
6. Run the seed only with `DEMO_ADMIN_EMAIL` and `DEMO_ADMIN_PASSWORD` supplied by the secret manager.

The current relational models use portable Prisma types. PostgreSQL staging validation is still required before deployment because the checked-in development migration SQL is SQLite-specific. Do not apply the existing SQLite migration directories to PostgreSQL; generate a PostgreSQL baseline from the schema in a staging-only migration directory.
