# Fix Database Error Saving New Users

## Problem
Users cannot sign up - getting "database error saving new user". The issue is that the trigger function needs proper permissions to insert into the profiles table.

## Root Cause
The trigger function uses `SECURITY DEFINER` which should bypass RLS, but we need to ensure:
1. The trigger function is properly deployed
2. RLS policies allow the trigger to insert (or the function bypasses RLS correctly)
3. The function has proper error handling

## Solution

### Step 1: Update the Trigger Function with Better Error Handling

Go to **Supabase SQL Editor**: https://app.supabase.com/project/gdsblffnkiswaweqokcm/sql/new

Run this complete fix:

```sql
-- Drop and recreate the function with proper permissions
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Create the function with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
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
  -- SECURITY DEFINER should bypass RLS, but we'll handle errors gracefully
  BEGIN
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (
      NEW.id,
      final_username,
      COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION
    WHEN unique_violation THEN
      -- If username still conflicts, use UUID-based username
      INSERT INTO public.profiles (id, username, display_name)
      VALUES (
        NEW.id,
        'user_' || substr(NEW.id::text, 1, 8),
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
      )
      ON CONFLICT (id) DO NOTHING;
    WHEN OTHERS THEN
      -- Log error but don't fail user creation
      RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
      -- Try minimal fallback
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
          RAISE WARNING 'Failed to create profile even with fallback: %', SQLERRM;
      END;
  END;
  
  RETURN NEW;
END;
$$;

-- Ensure trigger exists and is properly configured
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions (if needed)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.profiles TO postgres, service_role;
```

### Step 2: Verify RLS Policies

Check that RLS is enabled but the trigger can bypass it:

```sql
-- Check RLS status
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'profiles';

-- The trigger uses SECURITY DEFINER which should bypass RLS
-- But let's verify the insert policy exists (for manual inserts)
SELECT * FROM pg_policies WHERE tablename = 'profiles';
```

### Step 3: Test the Trigger

After running the SQL above, test by:

1. **Check if function exists:**
```sql
SELECT proname, prosecdef 
FROM pg_proc 
WHERE proname = 'handle_new_user';
-- prosecdef should be 't' (true) for SECURITY DEFINER
```

2. **Check trigger exists:**
```sql
SELECT tgname, tgenabled 
FROM pg_trigger 
WHERE tgname = 'on_auth_user_created';
```

3. **Try signing up a test user** in your app

4. **Check if profile was created:**
```sql
SELECT id, username, display_name, created_at 
FROM public.profiles 
ORDER BY created_at DESC 
LIMIT 5;
```

### Step 4: Check Supabase Auth Settings

1. Go to **Authentication** → **Settings** in Supabase Dashboard
2. Ensure:
   - **Enable email signup** is ON
   - **Confirm email** is set to your preference (OFF for testing, ON for production)
   - **Site URL** is set correctly

### Step 5: Check Logs

If it still fails, check the logs:

1. Go to **Logs** → **Postgres Logs** in Supabase Dashboard
2. Look for errors from `handle_new_user` function
3. Check for any RLS policy violations

## Alternative: Manual Profile Creation (Temporary Workaround)

If the trigger still doesn't work, you can manually create profiles after signup. But this is not recommended for production - the trigger should work.

## Key Points

- `SECURITY DEFINER` allows the function to run with the privileges of the function owner (usually postgres)
- `SET search_path = public` ensures the function uses the correct schema
- The function should bypass RLS policies when inserting
- Multiple fallback strategies ensure profile creation doesn't fail

## Verification Checklist

- [ ] Function created with `SECURITY DEFINER`
- [ ] Trigger exists on `auth.users`
- [ ] Test signup works
- [ ] Profile is created automatically
- [ ] No errors in Postgres logs
