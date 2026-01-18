#!/usr/bin/env node
/**
 * Apply migrations via direct PostgreSQL connection
 * Usage: node apply-migrations-node.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get database URL from Supabase secrets or environment
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || '';

if (!SUPABASE_DB_URL) {
  console.error('❌ SUPABASE_DB_URL not set');
  console.log('Getting from Supabase secrets...');
  
  // Try to get from Supabase CLI
  const { execSync } = await import('child_process');
  try {
    const output = execSync('supabase secrets list 2>/dev/null | grep SUPABASE_DB_URL | awk \'{print $NF}\'', { encoding: 'utf-8' });
    const dbUrl = output.trim();
    if (dbUrl && dbUrl.startsWith('postgresql://')) {
      process.env.SUPABASE_DB_URL = dbUrl;
    } else {
      throw new Error('Could not get DB URL');
    }
  } catch (e) {
    console.error('Please set SUPABASE_DB_URL environment variable');
    console.log('Or run: supabase secrets list | grep SUPABASE_DB_URL');
    process.exit(1);
  }
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

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
});

async function applyMigration(filename) {
  const filePath = join(__dirname, 'supabase', 'migrations', filename);
  const sql = readFileSync(filePath, 'utf-8');

  console.log(`📄 Applying ${filename}...`);

  try {
    await client.query(sql);
    console.log(`✅ ${filename} applied successfully\n`);
    return true;
  } catch (error) {
    // Check if it's a "already exists" error (safe to ignore)
    if (error.message.includes('already exists') || 
        error.message.includes('duplicate') ||
        error.code === '42P07' || // relation already exists
        error.code === '42710') {  // duplicate object
      console.log(`⚠️  ${filename} - Some objects already exist (skipping): ${error.message.split('\n')[0]}\n`);
      return true;
    }
    console.error(`❌ Failed to apply ${filename}:`);
    console.error(`   ${error.message}\n`);
    return false;
  }
}

async function main() {
  console.log('🚀 Connecting to database...\n');
  
  try {
    await client.connect();
    console.log('✅ Connected to database\n');
  } catch (error) {
    console.error('❌ Failed to connect to database:', error.message);
    process.exit(1);
  }

  console.log(`📦 Applying ${MIGRATIONS.length} migrations...\n`);

  let successCount = 0;
  let failCount = 0;

  for (const migration of MIGRATIONS) {
    const success = await applyMigration(migration);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  await client.end();

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    MIGRATION SUMMARY                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`✅ Successful: ${successCount}`);
  if (failCount > 0) {
    console.log(`❌ Failed: ${failCount}`);
  }
  console.log('');

  if (failCount === 0) {
    console.log('🎉 All migrations applied successfully!');
  } else {
    console.log('⚠️  Some migrations failed. Check errors above.');
    console.log('   You may need to apply failed migrations manually.');
  }
}

main().catch(console.error);
