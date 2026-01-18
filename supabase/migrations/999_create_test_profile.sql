-- Create Test Profile for Demos/Testing
-- 
-- This migration creates a test user account that can be shared for demos.
-- 
-- IMPORTANT: This requires a service role key or manual auth user creation.
-- For easier setup, use: node scripts/create-test-profile.mjs
--
-- Manual steps:
-- 1. Create auth user in Supabase Dashboard → Authentication → Users → Add User
-- 2. Copy the user ID
-- 3. Run this SQL with the user ID

-- Option 1: If you already have a test user ID, replace 'YOUR_USER_ID_HERE' below
DO $$
DECLARE
  test_user_id UUID;
  test_email TEXT := 'demo@innercity.app';
BEGIN
  -- Try to find existing test user
  SELECT id INTO test_user_id
  FROM auth.users
  WHERE email = test_email
  LIMIT 1;

  -- If user doesn't exist, you need to create it first via Supabase Dashboard
  -- or use the Node.js script: node scripts/create-test-profile.mjs
  IF test_user_id IS NULL THEN
    RAISE NOTICE '⚠️  Test user not found. Please either:';
    RAISE NOTICE '  1. Create user in Supabase Dashboard → Authentication → Users';
    RAISE NOTICE '  2. Or run: node scripts/create-test-profile.mjs';
    RETURN;
  END IF;

  -- Create or update profile
  INSERT INTO public.profiles (
    id,
    username,
    display_name,
    bio,
    interests,
    home_city,
    verified,
    organizer_tier
  ) VALUES (
    test_user_id,
    'demo_user',
    'Demo User',
    'This is a demo account for testing Inner City. Feel free to explore!',
    ARRAY['music', 'nightlife', 'events', 'raves', 'concerts'],
    'Berlin',
    false,
    'none'
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    bio = EXCLUDED.bio,
    interests = EXCLUDED.interests,
    home_city = EXCLUDED.home_city;

  RAISE NOTICE '✅ Test profile created/updated for user: %', test_user_id;
  RAISE NOTICE '📧 Email: demo@innercity.app';
  RAISE NOTICE '👤 Username: demo_user';
END $$;

-- Option 2: Manual creation (uncomment and replace YOUR_USER_ID_HERE)
/*
INSERT INTO public.profiles (
  id,
  username,
  display_name,
  bio,
  interests,
  home_city,
  verified,
  organizer_tier
) VALUES (
  'YOUR_USER_ID_HERE'::UUID,
  'demo_user',
  'Demo User',
  'This is a demo account for testing Inner City. Feel free to explore!',
  ARRAY['music', 'nightlife', 'events', 'raves', 'concerts'],
  'Berlin',
  false,
  'none'
)
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  display_name = EXCLUDED.display_name,
  bio = EXCLUDED.bio,
  interests = EXCLUDED.interests,
  home_city = EXCLUDED.home_city;
*/
