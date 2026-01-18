#!/usr/bin/env node
/**
 * Create a Test Profile for Inner City
 * 
 * This script creates a test user account that can be shared for demos/testing.
 * 
 * Usage:
 *   node scripts/create-test-profile.mjs
 * 
 * Or with custom credentials:
 *   node scripts/create-test-profile.mjs --email test@innercity.app --password Test123!
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env.local');

try {
  config({ path: envPath });
} catch (e) {
  console.warn('⚠️  .env.local not found, using environment variables');
}

// Try multiple possible variable names
const supabaseUrl = process.env.VITE_SUPABASE_URL || 
                    process.env.SUPABASE_URL || 
                    'https://gdsblffnkiswaweqokcm.supabase.co';
                    
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                           process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
                           process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Missing Supabase Service Role Key!');
  console.error('\n📋 To get your Service Role Key:');
  console.error('  1. Go to: https://app.supabase.com/project/gdsblffnkiswaweqokcm/settings/api');
  console.error('  2. Copy the "service_role" key (⚠️  Keep it secret!)');
  console.error('  3. Add to .env.local:');
  console.error('     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here');
  console.error('\n💡 The Service Role Key is needed to create users programmatically.');
  console.error('   The anon key cannot create users.');
  process.exit(1);
}

if (!supabaseUrl || supabaseUrl === 'https://gdsblffnkiswaweqokcm.supabase.co') {
  console.log('✅ Using Supabase URL: https://gdsblffnkiswaweqokcm.supabase.co');
}

// Use service role key for admin operations, fallback to anon key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Default test credentials
const defaultEmail = 'demo@innercity.app';
const defaultPassword = 'Demo123!';
const defaultDisplayName = 'Demo User';
const defaultUsername = 'demo_user';

// Parse command line arguments
const args = process.argv.slice(2);
let email = defaultEmail;
let password = defaultPassword;
let displayName = defaultDisplayName;
let username = defaultUsername;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--email' && args[i + 1]) {
    email = args[i + 1];
    i++;
  } else if (args[i] === '--password' && args[i + 1]) {
    password = args[i + 1];
    i++;
  } else if (args[i] === '--display-name' && args[i + 1]) {
    displayName = args[i + 1];
    i++;
  } else if (args[i] === '--username' && args[i + 1]) {
    username = args[i + 1];
    i++;
  }
}

async function createTestProfile() {
  console.log('🚀 Creating test profile...\n');
  console.log('Credentials:');
  console.log(`  Email: ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Display Name: ${displayName}`);
  console.log(`  Username: ${username}\n`);

  try {
    // Step 1: Create auth user
    console.log('📝 Step 1: Creating auth user...');
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for test account
      user_metadata: {
        display_name: displayName,
        username: username,
      },
    });

    if (authError) {
      // If user already exists, try to get existing user
      if (authError.message.includes('already registered')) {
        console.log('⚠️  User already exists, fetching existing user...');
        const { data: existingUser } = await supabase.auth.admin.listUsers();
        const user = existingUser?.users?.find(u => u.email === email);
        
        if (user) {
          console.log('✅ Found existing user:', user.id);
          const userId = user.id;
          
          // Step 2: Ensure profile exists
          console.log('📝 Step 2: Checking profile...');
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

          if (existingProfile) {
            console.log('✅ Profile already exists!');
            console.log('\n📋 Test Account Details:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`Email: ${email}`);
            console.log(`Password: ${password}`);
            console.log(`Username: ${existingProfile.username}`);
            console.log(`Display Name: ${existingProfile.display_name || displayName}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            return;
          } else {
            // Create profile for existing user
            const { error: profileError } = await supabase
              .from('profiles')
              .insert({
                id: userId,
                username: username,
                display_name: displayName,
                bio: 'This is a demo account for testing Inner City.',
                interests: ['music', 'nightlife', 'events'],
                home_city: 'Berlin',
                verified: false,
              });

            if (profileError) {
              console.error('❌ Error creating profile:', profileError);
              throw profileError;
            }

            console.log('✅ Profile created for existing user!');
            console.log('\n📋 Test Account Details:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`Email: ${email}`);
            console.log(`Password: ${password}`);
            console.log(`Username: ${username}`);
            console.log(`Display Name: ${displayName}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            return;
          }
        } else {
          throw new Error('User exists but could not be found');
        }
      } else {
        throw authError;
      }
    }

    if (!authData.user) {
      throw new Error('Failed to create user');
    }

    console.log('✅ Auth user created:', authData.user.id);

    // Step 2: Wait a moment for trigger to create profile
    console.log('📝 Step 2: Waiting for profile trigger...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 3: Check if profile was created by trigger
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      // If trigger didn't create profile, create it manually
      console.log('⚠️  Profile not created by trigger, creating manually...');
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          username: username,
          display_name: displayName,
          bio: 'This is a demo account for testing Inner City.',
          interests: ['music', 'nightlife', 'events'],
          home_city: 'Berlin',
          verified: false,
        });

      if (insertError) {
        console.error('❌ Error creating profile:', insertError);
        throw insertError;
      }
      console.log('✅ Profile created manually');
    } else {
      // Update profile with better defaults
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          username: username,
          display_name: displayName,
          bio: 'This is a demo account for testing Inner City.',
          interests: ['music', 'nightlife', 'events'],
          home_city: 'Berlin',
        })
        .eq('id', authData.user.id);

      if (updateError) {
        console.warn('⚠️  Could not update profile:', updateError.message);
      } else {
        console.log('✅ Profile updated with demo data');
      }
    }

    // Success!
    console.log('\n✅ Test profile created successfully!\n');
    console.log('📋 Test Account Details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Username: ${username}`);
    console.log(`Display Name: ${displayName}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('💡 You can now share these credentials for testing/demos.\n');

  } catch (error) {
    console.error('\n❌ Error creating test profile:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

createTestProfile();
