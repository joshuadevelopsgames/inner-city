#!/usr/bin/env node
/**
 * Apply migrations via Supabase Management API
 * Usage: node apply-migrations-api.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_REF = 'gdsblffnkiswaweqokcm';
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

if (!SUPABASE_ACCESS_TOKEN) {
  console.error('❌ SUPABASE_ACCESS_TOKEN environment variable not set');
  console.log('Get it from: https://app.supabase.com/account/tokens');
  process.exit(1);
}

const MIGRATIONS = [
  '003_reservation_system.sql',
  '004_webhook_idempotency.sql',
  '006_qr_token_system.sql',
  '007_atomic_check_in.sql',
  '008_payout_system.sql',
  '009_reconciliation_system.sql',
  '010_trust_tier_upgrade.sql',
  '012_fraud_detection_system.sql',
  '013_fraud_admin_views.sql',
  '014_add_high_demand_flag.sql',
];

async function applyMigration(filename) {
  const filePath = join(__dirname, 'supabase', 'migrations', filename);
  const sql = readFileSync(filePath, 'utf-8');

  console.log(`📄 Applying ${filename}...`);

  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: sql,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const result = await response.json();
    console.log(`✅ ${filename} applied successfully`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to apply ${filename}:`, error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Applying migrations via Supabase API...\n');

  for (const migration of MIGRATIONS) {
    try {
      await applyMigration(migration);
    } catch (error) {
      console.error(`\n⚠️  Stopping migration application due to error`);
      console.error(`\nYou can apply remaining migrations manually at:`);
      console.error(`https://app.supabase.com/project/${PROJECT_REF}/sql/new\n`);
      process.exit(1);
    }
  }

  console.log('\n✅ All migrations applied successfully!');
}

main().catch(console.error);
