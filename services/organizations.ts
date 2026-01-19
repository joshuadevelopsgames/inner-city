/**
 * Organizations Service
 * Handles organizations (event curators/promoters) that host events
 */

import { supabase } from '../lib/supabase';
import { Organization, OrganizationMember, User } from '../types';

// ============================================================================
// ORGANIZATIONS
// ============================================================================

export async function createOrganization(
  name: string,
  cityId: string,
  createdBy: string,
  options: {
    description?: string;
    logoUrl?: string;
    coverImageUrl?: string;
    websiteUrl?: string;
    instagramHandle?: string;
    twitterHandle?: string;
  } = {}
): Promise<Organization> {
  // Generate slug from name
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name,
      slug,
      city_id: cityId,
      created_by: createdBy,
      description: options.description,
      logo_url: options.logoUrl,
      cover_image_url: options.coverImageUrl,
      website_url: options.websiteUrl,
      instagram_handle: options.instagramHandle,
      twitter_handle: options.twitterHandle,
    })
    .select()
    .single();

  if (error) throw error;

  // Add creator as owner
  await addOrganizationMember(data.id, createdBy, 'owner');

  return transformOrganization(data);
}

export async function getOrganization(slug: string): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return transformOrganization(data);
}

export async function getOrganizationById(id: string): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return transformOrganization(data);
}

export async function getOrganizationsByCity(cityId: string): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('city_id', cityId)
    .order('follower_count', { ascending: false });

  if (error) throw error;
  return (data || []).map(transformOrganization);
}

export async function updateOrganization(
  organizationId: string,
  updates: Partial<Organization>
): Promise<Organization> {
  const { data, error } = await supabase
    .from('organizations')
    .update({
      name: updates.name,
      description: updates.description,
      logo_url: updates.logoUrl,
      cover_image_url: updates.coverImageUrl,
      website_url: updates.websiteUrl,
      instagram_handle: updates.instagramHandle,
      twitter_handle: updates.twitterHandle,
    })
    .eq('id', organizationId)
    .select()
    .single();

  if (error) throw error;
  return transformOrganization(data);
}

// ============================================================================
// ORGANIZATION MEMBERS
// ============================================================================

export async function addOrganizationMember(
  organizationId: string,
  userId: string,
  role: 'member' | 'admin' | 'owner' = 'member'
): Promise<void> {
  const { error } = await supabase
    .from('organization_members')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      role,
    });

  if (error && error.code !== '23505') throw error; // Ignore duplicates
}

export async function removeOrganizationMember(
  organizationId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('organization_id', organizationId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function getOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
  const { data, error } = await supabase
    .from('organization_members')
    .select(`
      *,
      profiles!organization_members_user_id_fkey(*)
    `)
    .eq('organization_id', organizationId)
    .order('joined_at', { ascending: true });

  if (error) throw error;

  return (data || []).map((item: any) => ({
    organizationId: item.organization_id,
    userId: item.user_id,
    role: item.role,
    joinedAt: item.joined_at,
    user: item.profiles ? transformProfileToUser(item.profiles) : undefined,
  }));
}

export async function getUserOrganizations(userId: string): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organization_members')
    .select(`
      organization_id,
      organizations(*)
    `)
    .eq('user_id', userId);

  if (error) throw error;
  return (data || []).map((item: any) => transformOrganization(item.organizations));
}

export async function isOrganizationMember(
  organizationId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return !!data;
}

export async function canUserCreateEventsForOrganization(
  organizationId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return !!data; // Any member can create events
}

// ============================================================================
// ORGANIZATION FOLLOWERS
// ============================================================================

export async function followOrganization(organizationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('organization_followers')
    .insert({
      organization_id: organizationId,
      user_id: userId,
    });

  if (error && error.code !== '23505') throw error; // Ignore duplicates
}

export async function unfollowOrganization(organizationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('organization_followers')
    .delete()
    .eq('organization_id', organizationId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function isFollowingOrganization(
  organizationId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('organization_followers')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return !!data;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function transformOrganization(data: any): Organization {
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    description: data.description,
    cityId: data.city_id,
    logoUrl: data.logo_url,
    coverImageUrl: data.cover_image_url,
    websiteUrl: data.website_url,
    instagramHandle: data.instagram_handle,
    twitterHandle: data.twitter_handle,
    createdBy: data.created_by,
    verified: data.verified || false,
    eventCount: data.event_count || 0,
    followerCount: data.follower_count || 0,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function transformProfileToUser(profile: any): User {
  const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.id}`;
  const avatarUrl = profile.avatar_url || defaultAvatar;
  const profilePhotos = (profile.profile_photos && Array.isArray(profile.profile_photos) && profile.profile_photos.length > 0)
    ? profile.profile_photos 
    : [avatarUrl];

  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.display_name,
    avatarUrl: avatarUrl,
    profilePhotos: profilePhotos,
    bio: profile.bio || '',
    socials: {},
    interests: profile.interests || [],
    homeCity: profile.home_city || '',
    travelCities: profile.travel_cities || [],
    profileMode: profile.profile_mode || 'full',
    organizerTier: profile.organizer_tier || 'none',
    verified: profile.verified || false,
    createdAt: profile.created_at || new Date().toISOString(),
  };
}
