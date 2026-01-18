#!/usr/bin/env node

/**
 * Script to update the handle_new_user trigger function via Supabase REST API
 * This uses the Supabase Management API to execute SQL
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the SQL file
const sqlFile = join(__dirname, '..', 'fix_trigger.sql');
const sql = readFileSync(sqlFile, 'utf-8');

console.log('📝 SQL to execute:');
console.log('─'.repeat(50));
console.log(sql.substring(0, 200) + '...');
console.log('─'.repeat(50));
console.log('\n⚠️  Supabase CLI does not support direct SQL execution.');
console.log('📋 Please run this SQL manually in the Supabase Dashboard:\n');
console.log('1. Go to: https://app.supabase.com/project/gdsblffnkiswaweqokcm/sql/new');
console.log('2. Copy the contents of: fix_trigger.sql');
console.log('3. Paste and click "Run"\n');
console.log('Or use psql with your database connection string:\n');
console.log('  psql "postgresql://postgres:[PASSWORD]@db.gdsblffnkiswaweqokcm.supabase.co:5432/postgres" -f fix_trigger.sql\n');
