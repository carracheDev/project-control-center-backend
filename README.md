## Production preparation

The local development database uses SQLite. Production must use PostgreSQL by changing the Prisma datasource provider to `postgresql`, setting `DATABASE_URL` to the PostgreSQL connection string, and generating a PostgreSQL migration from the current schema. Do this against a staging database first; never reset a production database.

Required production environment variables are listed in `.env.example`. `JWT_SECRET`, Firebase credentials, database credentials, and demo admin credentials must be injected by the deployment secret store and never committed.

Evidence uploads are stored outside source files in `EVIDENCE_STORAGE_DIR`. The API generates file names, validates MIME type, enforces a 10 MB limit, and controls downloads through authenticated project access.

### PostgreSQL backup and restore

Recommended minimum for V1: a daily compressed `pg_dump` retained for 30 days, plus a weekly restore rehearsal in a disposable staging database.

```sh
pg_dump --format=custom --file=pcc-$(date +%Y%m%d).dump "$DATABASE_URL"
createdb pcc_restore_check
pg_restore --clean --if-exists --dbname="$RESTORE_DATABASE_URL" pcc-$(date +%Y%m%d).dump
```

Verify the restored application with `npx prisma migrate status`, the backend test suite, and a login/read-only smoke test before deleting the rehearsal database.
# PCC Backend

Backend NestJS du Project Control Center, avec Prisma et SQLite.

## Installation

```bash
npm install
cp .env.example .env
npx prisma migrate dev
```

`DATABASE_URL` pointe par défaut vers `file:./dev.db`, dans `backend/prisma/`. `FRONTEND_URL` définit l'origine CORS et `PORT` le port HTTP.

## Développement

```bash
npm run start:dev
```

L'API écoute par défaut sur `http://localhost:3000`.

## Prisma et données DEMO

```bash
npx prisma validate
npx prisma migrate status
npm run prisma:migrate
npm run prisma:seed
```

Le seed est opt-in et crée uniquement `Projet pilote PCC` avec des données explicitement marquées DEMO. Il ne s'exécute jamais au démarrage.

## Workflow métier

- Les phases sont créées `PLANNED` ou `LOCKED` selon leur précédente phase.
- `Readiness` diagnostique les manques.
- `Gating` évalue les conditions configurées.
- Seul `POST /phases/:phaseId/validate` peut produire `VALIDATED`.
- Les validations sont historisées avec un snapshot du Gating.
- Le dashboard agrège les projets sans créer de score.
- Les décisions `GO`, `PIVOT`, `NO_GO` sont humaines, explicites et immuables.

## Tests

```bash
npm test
npm run test:e2e
npm run test:cov
npm run build
npm run lint
```

## Backup SQLite

Avant une migration ou une opération destructive :

```bash
npm run db:backup
```

La copie est déposée dans `backend/backups/` avec un horodatage. Restaurer consiste à arrêter l'API puis remplacer `backend/prisma/dev.db` par une copie vérifiée.

## Structure

Les modules métier vivent sous `src/`. Les migrations et le seed vivent sous `prisma/`. Le backend reste la source de vérité pour les statuts, diagnostics, validations et décisions.
# project-control-center-backend
