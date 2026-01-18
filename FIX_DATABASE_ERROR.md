# Fix "Database Error Saving New User"

## Problem
Getting "database error saving new user" when signing up. This is typically caused by:
1. The trigger function not being updated in Supabase
2. RLS policies blocking the trigger function
3. Username uniqueness constraint violations
4. Trigger function errors

## Solution

### Step 1: Verify RLS Policies

The trigger function uses `SECURITY DEFINER` which should bypass RLS, but we need to ensure the policies are correct.

1. **Go to Supabase SQL Editor**: https://app.supabase.com/project/gdsblffnkiswaweqokcm/sql/new

2. **Check if the trigger function exists and is correct**:

```sql
-- Check if trigger function exists
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'handle_new_user';
```

3. **If it doesn't exist or is outdated, run this complete fix**:

```sql
-- First, ensure the trigger function can bypass RLS
-- The function uses SECURITY DEFINER which should work, but let's make sure

-- Drop and recreate the function with better error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  username_counter INTEGER := 0;
BEGIN
  -- Get base username from metadata or generate from email
  base_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9_]', '_', 'g'))
  );
  
  -- Ensure username is not empty and starts with a letter
  IF base_username IS NULL OR base_username = '' THEN
    base_username := 'user_' || substr(NEW.id::text, 1, 8);
  ELSIF NOT (base_username ~ '^[a-z]') THEN
    base_username := 'user_' || base_username;
  END IF;
  
  -- Ensure username is not too long (max 30 chars)
  IF length(base_username) > 30 THEN
    base_username := substr(base_username, 1, 30);
  END IF;
  
  -- Handle unique constraint: if username exists, append number
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    username_counter := username_counter + 1;
    final_username := base_username || '_' || username_counter;
    -- Prevent infinite loop
    IF username_counter > 1000 THEN
      final_username := 'user_' || substr(NEW.id::text, 1, 8);
      EXIT;
    END IF;
  END LOOP;
  
  -- Insert profile with unique username
  -- Use SECURITY DEFINER to bypass RLS
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING; -- Prevent duplicate inserts
  
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- If username still conflicts (shouldn't happen), use UUID-based username
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (
      NEW.id,
      'user_' || substr(NEW.id::text, 1, 8),
      COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  WHEN OTHERS THEN
    -- Log error but don't fail user creation
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    -- Try to create with minimal data
    BEGIN
      INSERT INTO public.profiles (id, username, display_name)
      VALUES (
        NEW.id,
        'user_' || substr(NEW.id::text, 1, 8),
        split_part(NEW.email, '@', 1)
      )
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION
      WHEN OTHERS THEN
        -- If even this fails, just log and continue
        RAISE WARNING 'Failed to create profile even with fallback: %', SQLERRM;
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Step 2: Verify RLS Policies

Make sure the RLS policies allow the trigger to work:

```sql
-- Check current policies
SELECT * FROM pg_policies WHERE tablename = 'profiles';

-- The trigger uses SECURITY DEFINER, so it should bypass RLS
-- But let's make sure the insert policy exists (even though trigger bypasses it)
-- This is just for reference - the trigger should work regardless
```

### Step 3: Test the Trigger

Test if the trigger works by checking logs:

1. Go to **Supabase Dashboard** → **Logs** → **Postgres Logs**
2. Try signing up a new user
3. Check the logs for any errors from `handle_new_user`

### Step 4: Manual Profile Creation (Fallback)

If the trigger still fails, you can manually create profiles. But first, let's check if profiles are being created:

```sql
-- Check recent profiles
SELECT id, username, display_name, created_at 
FROM public.profiles 
ORDER BY created_at DESC 
LIMIT 10;
```

## Common Issues

1. **Username too long**: Fixed by truncating to 30 chars
2. **Infinite loop in username generation**: Fixed with counter limit
3. **Unique constraint violation**: Fixed with better conflict handling
4. **RLS blocking**: Should be bypassed by SECURITY DEFINER, but verify

## Verification

After running the SQL above:
1. Try signing up a new user
2. Check if profile is created: `SELECT * FROM public.profiles WHERE id = '<user_id>';`
3. If profile exists, the trigger is working!
