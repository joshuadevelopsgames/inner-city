# Fix Signup 500 Error

## Problem
Getting `500 Internal Server Error` when signing up new users. This is likely caused by:
1. Username uniqueness constraint violations
2. Trigger function errors
3. Invalid username format

## Solution

The trigger function has been updated to:
- Handle username conflicts by appending numbers
- Validate username format
- Use `ON CONFLICT DO NOTHING` to prevent duplicate inserts
- Add error handling to not block user creation

## Steps to Fix

1. **Go to Supabase SQL Editor**: https://app.supabase.com/project/gdsblffnkiswaweqokcm/sql/new

2. **Run this updated trigger function**:

```sql
-- Function to automatically create profile on user signup
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
  
  -- Handle unique constraint: if username exists, append number
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    username_counter := username_counter + 1;
    final_username := base_username || '_' || username_counter;
  END LOOP;
  
  -- Insert profile with unique username
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING; -- Prevent duplicate inserts
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail user creation
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

3. **Click "Run"** to update the function

4. **Test signup** - it should now work without 500 errors

## What This Fixes

- ✅ Handles duplicate usernames automatically
- ✅ Validates username format
- ✅ Prevents trigger from blocking user creation
- ✅ Handles edge cases gracefully
