# RAPPORT: État des Bases PostgreSQL

**Date**: 2026-09-11  
**Status**: ⏸️ EN ATTENTE DE CRÉATION DES BASES

---

## Bases Existantes (Vérifiées)

✅ **pcc_staging**  
   - État: Validée et utilisée
   - Données: Complètes (baseline PostgreSQL appliquée)
   - Protection: JAMAIS modifiée par tests
   - Backup: /tmp/pcc-staging-backup/pcc-staging-20260911-183907.dump

✅ **pcc_staging_restore**  
   - État: Existe (restauration depuis backup validée)
   - Protection: JAMAIS modifiée par tests

---

## Bases à Créer

❌ **pcc_dev** (Développement local)
   - Rôle: npm run start:dev + npm test
   - DATABASE_URL: pcc_dev PostgreSQL
   - État: **À CRÉER**

❌ **pcc_test** (E2E Tests)
   - Rôle: npm run test:e2e
   - DATABASE_URL: pcc_test PostgreSQL
   - État: **À CRÉER**

---

## Problème

L'utilisateur `pcc_staging` n'a pas les permissions `CREATE DATABASE` sur PostgreSQL.

```
ERROR: permission denied to create database
```

Ceci est une restriction de sécurité - seul un **superadmin PostgreSQL** peut créer des bases.

---

## Solutions

### Option A: Superadmin PostgreSQL crée les bases

**Commandes SQL (à exécuter par superadmin ou via sudo)**:

```sql
-- Connecter avec superadmin (postgres user)
psql -U postgres

-- Créer pcc_dev
CREATE DATABASE pcc_dev OWNER pcc_staging;

-- Créer pcc_test
CREATE DATABASE pcc_test OWNER pcc_staging;

-- Vérifier
SELECT datname FROM pg_database WHERE datname IN ('pcc_staging', 'pcc_staging_restore', 'pcc_dev', 'pcc_test') ORDER BY datname;
```

**Ou via une seule commande**:

```bash
sudo -u postgres psql << 'EOF'
CREATE DATABASE IF NOT EXISTS pcc_dev OWNER pcc_staging;
CREATE DATABASE IF NOT EXISTS pcc_test OWNER pcc_staging;
SELECT datname FROM pg_database WHERE datname IN ('pcc_staging', 'pcc_staging_restore', 'pcc_dev', 'pcc_test') ORDER BY datname;
EOF
```

### Option B: Donner les permissions à pcc_staging

**Commandes SQL (superadmin)**:

```sql
-- Connecter avec superadmin
psql -U postgres

-- Donner les permissions CREATE DATABASE
ALTER ROLE pcc_staging CREATEDB;

-- Vérifier
SELECT rolname, rolcreatedb FROM pg_roles WHERE rolname = 'pcc_staging';
```

Puis réessayer la création des bases avec pcc_staging.

---

## Prochaines Étapes

Une fois les bases créées, revenir et je vais:

1. **Vérifier la connexion** à pcc_dev et pcc_test
2. **Appliquer les migrations Prisma** (prisma migrate deploy)
3. **Valider les tests** (npm test, npm run test:e2e)
4. **Générer le rapport final**

---

## Commande Vérification (après création)

```bash
psql -h 127.0.0.1 -U pcc_staging -d pcc_staging -tc \
  "SELECT datname FROM pg_database WHERE datname IN ('pcc_staging', 'pcc_staging_restore', 'pcc_dev', 'pcc_test') ORDER BY datname;"
```

Résultat attendu:
```
 pcc_staging
 pcc_staging_restore
 pcc_dev
 pcc_test
```

---

## Protection Confirmée

✅ pcc_staging: Jamais supprimée ou modifiée  
✅ pcc_staging_restore: Jamais supprimée ou modifiée  
✅ Backup: Toujours disponible  
✅ Script: Utilise IF NOT EXISTS (safe restart)  

---

## Attendu

Créer pcc_dev et pcc_test via:
- Superadmin PostgreSQL, OU
- ALTER ROLE pcc_staging CREATEDB

Puis revenir pour la suite.
