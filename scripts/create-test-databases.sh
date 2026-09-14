#!/bin/bash

# Script: Create PCC Test Databases (Safe)
# Description: Creates pcc_dev and pcc_test PostgreSQL databases if they don't exist
# Protection: Never drops existing databases, protects pcc_staging and pcc_staging_restore
# Usage: bash scripts/create-test-databases.sh

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  PCC Test Databases - Safe Creation (IF NOT EXISTS)           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check PostgreSQL connection
echo "Checking PostgreSQL connection..."
if ! psql -c "SELECT 1" > /dev/null 2>&1; then
  echo -e "${RED}✗ ERROR: Cannot connect to PostgreSQL${NC}"
  echo "Ensure PostgreSQL is running and environment variables are set:"
  echo "  PGHOST (default: 127.0.0.1)"
  echo "  PGPORT (default: 5432)"
  echo "  PGUSER (default: pcc_staging)"
  exit 1
fi
echo -e "${GREEN}✓ PostgreSQL connected${NC}"
echo ""

# Function: Check if database exists
db_exists() {
  local db_name=$1
  psql -tc "SELECT 1 FROM pg_database WHERE datname = '$db_name'" | grep -q 1
}

# Function: Create database safely
create_database_safe() {
  local db_name=$1
  local owner=$2
  
  if db_exists "$db_name"; then
    echo -e "${YELLOW}⊘ Database '$db_name' already exists (skipping)${NC}"
    return 0
  fi
  
  echo "Creating database: $db_name..."
  psql -c "CREATE DATABASE $db_name OWNER $owner"
  echo -e "${GREEN}✓ Database '$db_name' created${NC}"
}

# Step 1: Create pcc_dev (if not exists)
echo "Step 1: pcc_dev (Development)"
echo "─────────────────────────────────────────────────────────────"
create_database_safe "pcc_dev" "pcc_staging"
echo ""

# Step 2: Create pcc_test (if not exists)
echo "Step 2: pcc_test (E2E Tests)"
echo "─────────────────────────────────────────────────────────────"
create_database_safe "pcc_test" "pcc_staging"
echo ""

# Step 3: Verify existing databases (protected)
echo "Step 3: Protected Databases"
echo "─────────────────────────────────────────────────────────────"

if db_exists "pcc_staging"; then
  echo -e "${GREEN}✓ pcc_staging exists (protected - never modified)${NC}"
else
  echo -e "${RED}✗ ERROR: pcc_staging not found${NC}"
  exit 1
fi

if db_exists "pcc_staging_restore"; then
  echo -e "${GREEN}✓ pcc_staging_restore exists (protected - never modified)${NC}"
else
  echo -e "${YELLOW}⊘ pcc_staging_restore not found (optional)${NC}"
fi
echo ""

# Step 4: Summary
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  SUMMARY                                                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Databases ready:"
echo -e "  ${GREEN}✓ pcc_dev${NC}              (development)"
echo -e "  ${GREEN}✓ pcc_test${NC}             (E2E tests)"
echo -e "  ${GREEN}✓ pcc_staging${NC}          (staging - protected)"
echo -e "  ${GREEN}✓ pcc_staging_restore${NC}  (backup - protected)"
echo ""
echo "Next steps:"
echo "  1. Verify migration status:"
echo "     npx prisma migrate status"
echo ""
echo "  2. Apply migrations (when ready):"
echo "     npx prisma migrate deploy"
echo ""
echo "  3. Run tests (when ready):"
echo "     npm test              # unit tests"
echo "     npm run test:e2e      # E2E tests"
echo ""
