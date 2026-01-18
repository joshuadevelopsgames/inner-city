import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_REF = 'gdsblffnkiswaweqokcm';
const SQL_EDITOR_URL = `https://app.supabase.com/project/${PROJECT_REF}/sql/new`;

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

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║     MIGRATION APPLICATION - AUTOMATED COPY TO CLIPBOARD      ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log(`SQL Editor: ${SQL_EDITOR_URL}\n`);

for (let i = 0; i < MIGRATIONS.length; i++) {
  const migration = MIGRATIONS[i];
  const filePath = join(__dirname, 'supabase', 'migrations', migration);
  
  try {
    const sql = readFileSync(filePath, 'utf-8');
    
    // Copy to clipboard using pbcopy (macOS)
    const { execSync } = await import('child_process');
    execSync('pbcopy', { input: sql });
    
    console.log(`✅ [${i+1}/${MIGRATIONS.length}] ${migration} copied to clipboard`);
    console.log(`   → Paste in SQL Editor and click "Run"\n`);
    
    // Wait a moment between copies
    if (i < MIGRATIONS.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    console.error(`❌ Failed to copy ${migration}:`, error.message);
  }
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║                    ✅ ALL MIGRATIONS COPIED                  ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log('📋 Next steps:');
console.log(`   1. Open SQL Editor: ${SQL_EDITOR_URL}`);
console.log('   2. Paste each migration (they\'re in your clipboard in order)');
console.log('   3. Click "Run" after each paste');
console.log('   4. Wait for "Success" message before pasting next migration\n');
