-- Create Storage Bucket for Profile Photos
-- This migration creates a public storage bucket for user profile photos

-- Create the bucket (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-photos',
  'profile-photos',
  true, -- Public bucket so photos can be accessed via URL
  5242880, -- 5MB file size limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for the bucket
-- Allow authenticated users to upload their own photos
DROP POLICY IF EXISTS "Users can upload their own profile photos" ON storage.objects;
CREATE POLICY "Users can upload their own profile photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own photos
DROP POLICY IF EXISTS "Users can update their own profile photos" ON storage.objects;
CREATE POLICY "Users can update their own profile photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'profile-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own photos
DROP POLICY IF EXISTS "Users can delete their own profile photos" ON storage.objects;
CREATE POLICY "Users can delete their own profile photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access (since bucket is public)
DROP POLICY IF EXISTS "Public can view profile photos" ON storage.objects;
CREATE POLICY "Public can view profile photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'profile-photos');
