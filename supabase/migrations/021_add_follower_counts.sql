-- Add follower and following counts to profiles table
-- These counts are automatically updated via triggers when follows are created/deleted

-- Add columns if they don't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS follower_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_follower_count ON public.profiles(follower_count DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_following_count ON public.profiles(following_count DESC);

-- Function to update follower count (when someone follows/unfollows a user)
CREATE OR REPLACE FUNCTION update_profile_follower_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Someone started following a user, increment that user's follower_count
    UPDATE public.profiles
    SET follower_count = follower_count + 1
    WHERE id = NEW.following_id;
    
    -- Increment the follower's following_count
    UPDATE public.profiles
    SET following_count = following_count + 1
    WHERE id = NEW.follower_id;
  ELSIF TG_OP = 'DELETE' THEN
    -- Someone unfollowed a user, decrement that user's follower_count
    UPDATE public.profiles
    SET follower_count = GREATEST(follower_count - 1, 0)
    WHERE id = OLD.following_id;
    
    -- Decrement the follower's following_count
    UPDATE public.profiles
    SET following_count = GREATEST(following_count - 1, 0)
    WHERE id = OLD.follower_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_update_profile_follower_count ON public.follows;
CREATE TRIGGER trigger_update_profile_follower_count
  AFTER INSERT OR DELETE ON public.follows
  FOR EACH ROW EXECUTE FUNCTION update_profile_follower_count();

-- Initialize counts for existing follows
DO $$
DECLARE
  profile_record RECORD;
BEGIN
  -- Update follower_count for each profile
  FOR profile_record IN SELECT id FROM public.profiles LOOP
    UPDATE public.profiles
    SET follower_count = (
      SELECT COUNT(*) FROM public.follows WHERE following_id = profile_record.id
    )
    WHERE id = profile_record.id;
    
    -- Update following_count for each profile
    UPDATE public.profiles
    SET following_count = (
      SELECT COUNT(*) FROM public.follows WHERE follower_id = profile_record.id
    )
    WHERE id = profile_record.id;
  END LOOP;
END $$;
