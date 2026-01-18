/**
 * Apply migrations via Supabase client
 * Usage: deno run --allow-net --allow-read apply-migrations-deno.ts
 */

import { readFileSync } from 'https://deno.land/std@0.168.0/node/fs.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

async function applyMigration(filename: string) {
  const filePath = `./supabase/migrations/${filename}`;
  const sql = readFileSync(filePath, 'utf-8');

  console.log(`📄 Applying ${filename}...`);

  // Split SQL by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    if (statement.trim().length === 0) continue;
    
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: statement });
      if (error) {
        // Try direct query if RPC doesn't work
        const { error: queryError } = await (supabase as any).from('_').select('*').limit(0);
        // Actually, we need to use the REST API directly
        console.warn(`⚠️  Statement may have failed, continuing...`);
      }
    } catch (e) {
      console.warn(`⚠️  Error executing statement: ${e.message}`);
    }
  }

  console.log(`✅ ${filename} processed`);
}

async function main() {
  console.log('🚀 Applying migrations via Supabase client...\n');

  // Note: Supabase JS client doesn't support raw SQL execution
  // We need to use the REST API or SQL editor
  console.log('⚠️  Direct SQL execution via JS client is limited.');
  console.log('📝 Please apply migrations via SQL Editor:');
  console.log('   https://app.supabase.com/project/gdsblffnkiswaweqokcm/sql/new\n');
  
  console.log('Migration files to apply:');
  for (const migration of MIGRATIONS) {
    console.log(`   • supabase/migrations/${migration}`);
  }
}

main();
