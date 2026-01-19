-- Profile Photos Migration
-- Adds support for multiple profile photos (like dating apps)

-- Add profile_photos column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS profile_photos TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Update existing profiles to migrate avatar_url to profile_photos
UPDATE public.profiles 
SET profile_photos = CASE 
  WHEN avatar_url IS NOT NULL AND avatar_url != '' THEN ARRAY[avatar_url]
  ELSE ARRAY[]::TEXT[]
END
WHERE profile_photos IS NULL OR array_length(profile_photos, 1) IS NULL;

-- Create index for faster queries on profiles with photos
CREATE INDEX IF NOT EXISTS idx_profiles_has_photos ON public.profiles(id) 
WHERE array_length(profile_photos, 1) > 0;
