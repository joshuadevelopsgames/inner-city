#!/usr/bin/env node
/**
 * Apply migrations via Supabase Management API
 * Requires SUPABASE_ACCESS_TOKEN environment variable
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_REF = 'gdsblffnkiswaweqokcm';
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

if (!SUPABASE_ACCESS_TOKEN) {
  console.error('❌ SUPABASE_ACCESS_TOKEN not set');
  console.log('\nTo get your access token:');
  console.log('1. Go to: https://app.supabase.com/account/tokens');
  console.log('2. Generate new token');
  console.log('3. Run: export SUPABASE_ACCESS_TOKEN="your-token"');
  console.log('4. Then run this script again\n');
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

async function applyMigrationViaAPI(filename) {
  const filePath = join(__dirname, 'supabase', 'migrations', filename);
  const sql = readFileSync(filePath, 'utf-8');

  console.log(`📄 Applying ${filename}...`);

  try {
    // Use Supabase Management API
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
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log(`✅ ${filename} applied successfully\n`);
    return true;
  } catch (error) {
    // Check if it's a "already exists" error
    if (error.message.includes('already exists') || 
        error.message.includes('duplicate') ||
        error.message.includes('42P07') ||
        error.message.includes('42710')) {
      console.log(`⚠️  ${filename} - Some objects already exist (continuing)\n`);
      return true;
    }
    console.error(`❌ Failed to apply ${filename}:`);
    console.error(`   ${error.message}\n`);
    return false;
  }
}

async function main() {
  console.log('🚀 Applying migrations via Supabase Management API...\n');
  console.log(`Project: ${PROJECT_REF}\n`);

  let successCount = 0;
  let failCount = 0;

  for (const migration of MIGRATIONS) {
    const success = await applyMigrationViaAPI(migration);
    if (success) {
      successCount++;
    } else {
      failCount++;
      // Continue with other migrations even if one fails
    }
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    MIGRATION SUMMARY                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`✅ Successful: ${successCount}`);
  if (failCount > 0) {
    console.log(`❌ Failed: ${failCount}`);
    console.log('\n⚠️  Some migrations failed. You may need to apply them manually.');
    console.log('   Go to: https://app.supabase.com/project/gdsblffnkiswaweqokcm/sql/new');
  } else {
    console.log('\n🎉 All migrations applied successfully!');
  }
}

main().catch(console.error);
