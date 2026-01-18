-- Fix RLS policies to allow trigger function to work
-- Update profiles policies to allow service role inserts

-- Drop and recreate profiles policies
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow service role (used by SECURITY DEFINER functions) to insert profiles
-- This ensures the trigger function can create profiles
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;
CREATE POLICY "Service role can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Drop and recreate the trigger function with proper permissions
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
  -- SECURITY DEFINER should bypass RLS, but we also have service_role policy
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
