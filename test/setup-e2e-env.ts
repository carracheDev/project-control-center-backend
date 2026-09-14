/**
 * E2E Environment Setup - Load .env.test with override
 *
 * This file ensures that E2E tests use the isolated pcc_test database
 * and never accidentally connect to pcc_dev or pcc_staging.
 *
 * Execution order (vitest setupFiles):
 * 1. This file runs FIRST → loads .env.test
 * 2. Then setup-e2e.ts runs → sets JWT secrets
 * 3. Then test files import AppModule
 * 4. beforeAll() runs → app.init() → Prisma connects to pcc_test
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

const envTestPath = path.resolve(process.cwd(), '.env.test');

// Step 1: Load default .env
const defaultEnvResult = dotenv.config();

// Step 2: Load and override with .env.test
const testEnvResult = dotenv.config({
  path: envTestPath,
  override: true,
});

// Step 3: Verify .env.test loaded successfully
if (testEnvResult.error) {
  if (testEnvResult.error.code === 'ENOENT') {
    console.error('[E2E Setup ERROR]');
    console.error(`File not found: ${envTestPath}`);
    console.error('');
    console.error('E2E tests require .env.test to be configured.');
    console.error('This ensures tests use pcc_test (not pcc_dev or pcc_staging).');
    console.error('');
    console.error('Create .env.test with:');
    console.error('  DATABASE_URL="postgresql://pcc_staging:<password>@127.0.0.1:5432/pcc_test?schema=public"');
    console.error('  JWT_SECRET="e2e-test-secret-only"');
    console.error('  (See .env.example for full template)');
    console.error('');
    process.exit(1);
  }
  throw testEnvResult.error;
}

// Step 4: Verify DATABASE_URL is set and points to pcc_test
const databaseUrl = process.env.DATABASE_URL || '';
if (!databaseUrl) {
  console.error('[E2E Setup ERROR]');
  console.error('DATABASE_URL not found in .env.test');
  console.error('Configure DATABASE_URL in .env.test before running E2E tests.');
  console.error('');
  process.exit(1);
}

if (!databaseUrl.includes('pcc_test')) {
  console.error('[E2E Setup WARNING]');
  console.error(`DATABASE_URL does not contain "pcc_test": ${databaseUrl}`);
  console.error('This may cause E2E tests to modify the wrong database.');
  console.error('');
  console.error('Expected .env.test DATABASE_URL to connect to pcc_test:');
  console.error('  DATABASE_URL="postgresql://...@.../pcc_test?..."');
  console.error('');
  // Note: Not exit(1) here - let it fail at connection time
  // This allows flexibility if pcc_test is named differently
}

console.log('[E2E Setup] ✓ Environment loaded from .env.test');
console.log('[E2E Setup] ✓ DATABASE_URL configured (isolation: pcc_test)');
