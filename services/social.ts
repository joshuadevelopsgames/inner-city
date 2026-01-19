/**
 * Social Features Service
 * Handles follows, posts, attendees, messages, etc.
 */

import { supabase } from '../lib/supabase';
import { UserPost, PostComment, EventAttendee, DirectMessage, EventReview, User, Event } from '../types';

// ============================================================================
// FOLLOWS
// ============================================================================

export async function followUser(followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .insert({
      follower_id: followerId,
      following_id: followingId,
    });

  if (error) throw error;
}

export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);

  if (error) throw error;
}

export async function getFollowers(userId: string): Promise<User[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id, profiles!follows_follower_id_fkey(*)')
    .eq('following_id', userId);

  if (error) throw error;
  
  // Transform profiles to User objects
  return (data || []).map((item: any) => {
    const profile = item.profiles;
    return {
      id: profile.id,
      username: profile.username,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      bio: profile.bio,
      socials: {},
      interests: profile.interests || [],
      homeCity: profile.home_city || '',
      travelCities: profile.travel_cities || [],
      profileMode: profile.profile_mode || 'full',
      organizerTier: profile.organizer_tier || 'none',
      verified: profile.verified || false,
      createdAt: profile.created_at,
    };
  });
}

export async function getFollowing(userId: string): Promise<User[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('following_id, profiles!follows_following_id_fkey(*)')
    .eq('follower_id', userId);

  if (error) throw error;
  
  return (data || []).map((item: any) => {
    const profile = item.profiles;
    return {
      id: profile.id,
      username: profile.username,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      bio: profile.bio,
      socials: {},
      interests: profile.interests || [],
      homeCity: profile.home_city || '',
      travelCities: profile.travel_cities || [],
      profileMode: profile.profile_mode || 'full',
      organizerTier: profile.organizer_tier || 'none',
      verified: profile.verified || false,
      createdAt: profile.created_at,
    };
  });
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
  return !!data;
}

// ============================================================================
// USER POSTS
// ============================================================================

export async function createPost(
  userId: string,
  content: string,
  eventId?: string,
  mediaUrls: string[] = []
): Promise<UserPost> {
  const { data, error } = await supabase
    .from('user_posts')
    .insert({
      user_id: userId,
      event_id: eventId || null,
      content,
      media_urls: mediaUrls,
    })
    .select()
    .single();

  if (error) throw error;
  return transformPost(data);
}

export async function getFeedPosts(
  userId?: string,
  limit: number = 20,
  offset: number = 0
): Promise<UserPost[]> {
  // user_posts.user_id references auth.users, not profiles, so we need to join manually
  let query = supabase
    .from('user_posts')
    .select(`
      *,
      events(*)
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;

  if (error) throw error;
  
  // Fetch profiles separately and merge
  if (data && data.length > 0) {
    const userIds = [...new Set(data.map((post: any) => post.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', userIds);
    
    const profilesMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);
    
    return data.map((post: any) => {
      const profile = profilesMap.get(post.user_id);
      return transformPost({ ...post, profiles: profile });
    });
  }
  
  return [];
}

export async function getEventPosts(eventId: string): Promise<UserPost[]> {
  const { data, error } = await supabase
    .from('user_posts')
    .select(`
      *,
      events(*)
    `)
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  
  // Fetch profiles separately and merge
  if (data && data.length > 0) {
    const userIds = [...new Set(data.map((post: any) => post.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', userIds);
    
    const profilesMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);
    
    return data.map((post: any) => {
      const profile = profilesMap.get(post.user_id);
      return transformPost({ ...post, profiles: profile });
    });
  }
  
  return [];
}

export async function getUserPosts(userId: string): Promise<UserPost[]> {
  const { data, error } = await supabase
    .from('user_posts')
    .select(`
      *,
      events(*)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  
  // Fetch profile separately and merge
  if (data && data.length > 0) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    return data.map((post: any) => transformPost({ ...post, profiles: profile }));
  }
  
  return [];
}

export async function likePost(postId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('post_likes')
    .insert({
      post_id: postId,
      user_id: userId,
    });

  if (error && error.code !== '23505') throw error; // Ignore duplicate likes
}

export async function unlikePost(postId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('post_likes')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function checkPostLiked(postId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('post_likes')
    .select('user_id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return !!data;
}

export async function getPostComments(postId: string): Promise<PostComment[]> {
  const { data, error } = await supabase
    .from('post_comments')
    .select(`
      *,
      profiles!post_comments_user_id_fkey(*)
    `)
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map((item: any) => ({
    id: item.id,
    postId: item.post_id,
    userId: item.user_id,
    content: item.content,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    user: item.profiles ? {
      id: item.profiles.id,
      username: item.profiles.username,
      displayName: item.profiles.display_name,
      avatarUrl: item.profiles.avatar_url,
      bio: item.profiles.bio,
      socials: {},
      interests: item.profiles.interests || [],
      homeCity: item.profiles.home_city || '',
      travelCities: item.profiles.travel_cities || [],
      profileMode: item.profiles.profile_mode || 'full',
      organizerTier: item.profiles.organizer_tier || 'none',
      verified: item.profiles.verified || false,
      createdAt: item.profiles.created_at,
    } : undefined,
  }));
}

export async function addPostComment(
  postId: string,
  userId: string,
  content: string
): Promise<PostComment> {
  const { data, error } = await supabase
    .from('post_comments')
    .insert({
      post_id: postId,
      user_id: userId,
      content,
    })
    .select()
    .single();

  if (error) throw error;
  return {
    id: data.id,
    postId: data.post_id,
    userId: data.user_id,
    content: data.content,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function transformPost(data: any): UserPost {
  return {
    id: data.id,
    userId: data.user_id,
    eventId: data.event_id,
    content: data.content,
    mediaUrls: data.media_urls || [],
    likesCount: data.likes_count || 0,
    commentsCount: data.comments_count || 0,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    user: data.profiles ? {
      id: data.profiles.id,
      username: data.profiles.username,
      displayName: data.profiles.display_name,
      avatarUrl: data.profiles.avatar_url,
      bio: data.profiles.bio,
      socials: {},
      interests: data.profiles.interests || [],
      homeCity: data.profiles.home_city || '',
      travelCities: data.profiles.travel_cities || [],
      profileMode: data.profiles.profile_mode || 'full',
      organizerTier: data.profiles.organizer_tier || 'none',
      verified: data.profiles.verified || false,
      createdAt: data.profiles.created_at,
    } : undefined,
    event: data.events ? {
      id: data.events.id,
      cityId: data.events.city_id,
      organizerId: data.events.organizer_id,
      tier: data.events.tier,
      title: data.events.title,
      shortDesc: data.events.short_desc,
      longDesc: data.events.long_desc,
      startAt: data.events.start_at,
      endAt: data.events.end_at,
      venueName: data.events.venue_name,
      address: data.events.address,
      lat: data.events.lat,
      lng: data.events.lng,
      categories: data.events.categories || [],
      subcategories: data.events.subcategories || [],
      mediaUrls: data.events.media_urls || [],
      ticketUrl: data.events.ticket_url,
      status: data.events.status,
      counts: data.events.counts || { likes: 0, saves: 0, comments: 0, rsvpGoing: 0, rsvpInterested: 0 },
    } : undefined,
  };
}

// ============================================================================
// EVENT ATTENDEES (Going Together)
// ============================================================================

export async function setEventAttendance(
  eventId: string,
  userId: string,
  status: 'going' | 'interested' | 'maybe',
  isPublic: boolean = true
): Promise<void> {
  const { error } = await supabase
    .from('event_attendees')
    .upsert({
      event_id: eventId,
      user_id: userId,
      status,
      is_public: isPublic,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'event_id,user_id',
    });

  if (error) throw error;
}

export async function removeEventAttendance(eventId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('event_attendees')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function getEventAttendees(
  eventId: string,
  status?: 'going' | 'interested' | 'maybe'
): Promise<EventAttendee[]> {
  let query = supabase
    .from('event_attendees')
    .select(`
      *,
      profiles!event_attendees_user_id_fkey(*)
    `)
    .eq('event_id', eventId)
    .eq('is_public', true);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data || []).map((item: any) => ({
    eventId: item.event_id,
    userId: item.user_id,
    status: item.status,
    isPublic: item.is_public,
    createdAt: item.created_at,
    checkedInAt: item.checked_in_at,
    user: item.profiles ? {
      id: item.profiles.id,
      username: item.profiles.username,
      displayName: item.profiles.display_name,
      avatarUrl: item.profiles.avatar_url,
      bio: item.profiles.bio,
      socials: {},
      interests: item.profiles.interests || [],
      homeCity: item.profiles.home_city || '',
      travelCities: item.profiles.travel_cities || [],
      profileMode: item.profiles.profile_mode || 'full',
      organizerTier: item.profiles.organizer_tier || 'none',
      verified: item.profiles.verified || false,
      createdAt: item.profiles.created_at,
    } : undefined,
  }));
}

// ============================================================================
// EVENT CHECK-INS
// ============================================================================

export async function checkInToEvent(eventId: string, userId: string): Promise<void> {
  // First ensure user has RSVP'd as "going"
  const { data: existing } = await supabase
    .from('event_attendees')
    .select('status')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .single();

  // If no RSVP, create one with "going" status
  if (!existing) {
    await setEventAttendance(eventId, userId, 'going', true);
  }

  // Update check-in timestamp
  const { error } = await supabase
    .from('event_attendees')
    .update({
      checked_in_at: new Date().toISOString(),
      status: 'going', // Ensure status is "going" when checking in
    })
    .eq('event_id', eventId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function getEventCheckIns(eventId: string): Promise<EventAttendee[]> {
  const { data, error } = await supabase
    .from('event_attendees')
    .select(`
      *,
      profiles!event_attendees_user_id_fkey(*)
    `)
    .eq('event_id', eventId)
    .not('checked_in_at', 'is', null)
    .order('checked_in_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((item: any) => ({
    eventId: item.event_id,
    userId: item.user_id,
    status: item.status,
    isPublic: item.is_public,
    createdAt: item.created_at,
    checkedInAt: item.checked_in_at,
    user: item.profiles ? {
      id: item.profiles.id,
      username: item.profiles.username,
      displayName: item.profiles.display_name,
      avatarUrl: item.profiles.avatar_url,
      bio: item.profiles.bio,
      socials: {},
      interests: item.profiles.interests || [],
      homeCity: item.profiles.home_city || '',
      travelCities: item.profiles.travel_cities || [],
      profileMode: item.profiles.profile_mode || 'full',
      organizerTier: item.profiles.organizer_tier || 'none',
      verified: item.profiles.verified || false,
      createdAt: item.profiles.created_at,
    } : undefined,
  }));
}

export async function isCheckedIn(eventId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('event_attendees')
    .select('checked_in_at')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .not('checked_in_at', 'is', null)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return !!data;
}

export async function getUserEventAttendance(
  eventId: string,
  userId: string
): Promise<EventAttendee | null> {
  const { data, error } = await supabase
    .from('event_attendees')
    .select('*')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data ? {
    eventId: data.event_id,
    userId: data.user_id,
    status: data.status,
    isPublic: data.is_public,
    createdAt: data.created_at,
    checkedInAt: data.checked_in_at,
  } : null;
}

export async function getUserInterestedEvents(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('event_attendees')
    .select('event_id')
    .eq('user_id', userId)
    .eq('status', 'interested');

  if (error) throw error;
  return (data || []).map(item => item.event_id);
}

export async function getUserEvents(userId: string, status?: 'going' | 'interested' | 'maybe'): Promise<EventAttendee[]> {
  let query = supabase
    .from('event_attendees')
    .select(`
      *,
      events!event_attendees_event_id_fkey(*)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map((item: any) => ({
    eventId: item.event_id,
    userId: item.user_id,
    status: item.status,
    isPublic: item.is_public,
    createdAt: item.created_at,
    event: item.events ? {
      id: item.events.id,
      title: item.events.title,
      shortDesc: item.events.short_desc,
      longDesc: item.events.long_desc,
      startAt: item.events.start_at,
      endAt: item.events.end_at,
      venueName: item.events.venue_name,
      address: item.events.address,
      cityId: item.events.city_id,
      lat: item.events.lat,
      lng: item.events.lng,
      mediaUrls: item.events.media_urls || [],
      categories: item.events.categories || [],
      subcategories: item.events.subcategories || [],
      organizerId: item.events.organizer_id,
      ticketmasterId: item.events.external_id,
      eventbriteId: item.events.external_id,
      ticketUrl: item.events.ticket_url,
      priceRanges: item.events.price_ranges,
      ageRestrictions: item.events.age_restrictions,
      ticketLimit: item.events.ticket_limit,
      promoter: item.events.promoter,
      venueDetails: item.events.venue_details,
      salesDates: item.events.sales_dates,
      timezone: item.events.timezone,
      locale: item.events.locale,
      onlineEvent: item.events.online_event,
      capacity: item.events.capacity,
      currency: item.events.currency,
      tier: item.events.tier,
      counts: item.events.counts || { likes: 0, saves: 0, comments: 0, rsvpGoing: 0, rsvpInterested: 0 },
    } : undefined,
  }));
}

// ============================================================================
// DIRECT MESSAGES
// ============================================================================

export async function sendDirectMessage(
  senderId: string,
  recipientId: string,
  message: string
): Promise<DirectMessage> {
  const { data, error } = await supabase
    .from('direct_messages')
    .insert({
      sender_id: senderId,
      recipient_id: recipientId,
      message,
    })
    .select()
    .single();

  if (error) throw error;
  return {
    id: data.id,
    senderId: data.sender_id,
    recipientId: data.recipient_id,
    message: data.message,
    readAt: data.read_at,
    createdAt: data.created_at,
  };
}

export async function getConversation(
  userId1: string,
  userId2: string,
  limit: number = 50
): Promise<DirectMessage[]> {
  const { data, error } = await supabase
    .from('direct_messages')
    .select(`
      *,
      sender:profiles!direct_messages_sender_id_fkey(*),
      recipient:profiles!direct_messages_recipient_id_fkey(*)
    `)
    .or(`and(sender_id.eq.${userId1},recipient_id.eq.${userId2}),and(sender_id.eq.${userId2},recipient_id.eq.${userId1})`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).reverse().map((item: any) => ({
    id: item.id,
    senderId: item.sender_id,
    recipientId: item.recipient_id,
    message: item.message,
    readAt: item.read_at,
    createdAt: item.created_at,
    sender: item.sender ? {
      id: item.sender.id,
      username: item.sender.username,
      displayName: item.sender.display_name,
      avatarUrl: item.sender.avatar_url,
      bio: item.sender.bio,
      socials: {},
      interests: item.sender.interests || [],
      homeCity: item.sender.home_city || '',
      travelCities: item.sender.travel_cities || [],
      profileMode: item.sender.profile_mode || 'full',
      organizerTier: item.sender.organizer_tier || 'none',
      verified: item.sender.verified || false,
      createdAt: item.sender.created_at,
    } : undefined,
    recipient: item.recipient ? {
      id: item.recipient.id,
      username: item.recipient.username,
      displayName: item.recipient.display_name,
      avatarUrl: item.recipient.avatar_url,
      bio: item.recipient.bio,
      socials: {},
      interests: item.recipient.interests || [],
      homeCity: item.recipient.home_city || '',
      travelCities: item.recipient.travel_cities || [],
      profileMode: item.recipient.profile_mode || 'full',
      organizerTier: item.recipient.organizer_tier || 'none',
      verified: item.recipient.verified || false,
      createdAt: item.recipient.created_at,
    } : undefined,
  }));
}

export async function markMessageAsRead(messageId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('recipient_id', userId);

  if (error) throw error;
}

export async function getConversations(userId: string): Promise<DirectMessage[]> {
  // Get the most recent message from each conversation
  const { data, error } = await supabase
    .rpc('get_user_conversations', { user_id: userId });

  if (error) {
    // Fallback: get all messages and group them
    const { data: messages, error: msgError } = await supabase
      .from('direct_messages')
      .select('*')
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (msgError) throw msgError;
    
    // Group by conversation partner and get latest
    const conversations = new Map<string, any>();
    (messages || []).forEach((msg: any) => {
      const partnerId = msg.sender_id === userId ? msg.recipient_id : msg.sender_id;
      if (!conversations.has(partnerId) || 
          new Date(msg.created_at) > new Date(conversations.get(partnerId).created_at)) {
        conversations.set(partnerId, msg);
      }
    });
    
    return Array.from(conversations.values()).map((msg: any) => ({
      id: msg.id,
      senderId: msg.sender_id,
      recipientId: msg.recipient_id,
      message: msg.message,
      readAt: msg.read_at,
      createdAt: msg.created_at,
    }));
  }
  
  return (data || []).map((msg: any) => ({
    id: msg.id,
    senderId: msg.sender_id,
    recipientId: msg.recipient_id,
    message: msg.message,
    readAt: msg.read_at,
    createdAt: msg.created_at,
  }));
}

// ============================================================================
// FRIEND DISCOVERY
// ============================================================================

/**
 * Find users with mutual interests
 */
export async function findUsersWithMutualInterests(
  userId: string,
  limit: number = 20
): Promise<User[]> {
  // Get current user's interests
  const { data: profile } = await supabase
    .from('profiles')
    .select('interests')
    .eq('id', userId)
    .single();

  if (!profile || !profile.interests || profile.interests.length === 0) {
    return [];
  }

  // Find users with overlapping interests
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('id', userId)
    .overlaps('interests', profile.interests)
    .limit(limit);

  if (error) throw error;

  return (data || []).map((p: any) => {
    const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.id}`;
    const avatarUrl = p.avatar_url || defaultAvatar;
    const profilePhotos = (p.profile_photos && Array.isArray(p.profile_photos) && p.profile_photos.length > 0)
      ? p.profile_photos 
      : [avatarUrl];

    return {
      id: p.id,
      username: p.username,
      displayName: p.display_name,
      avatarUrl: avatarUrl,
      profilePhotos: profilePhotos,
      bio: p.bio || '',
      socials: {},
      interests: p.interests || [],
      homeCity: p.home_city || '',
      travelCities: p.travel_cities || [],
      profileMode: p.profile_mode || 'full',
      organizerTier: p.organizer_tier || 'none',
      verified: p.verified || false,
      createdAt: p.created_at || new Date().toISOString(),
    };
  });
}

/**
 * Find users going to the same events
 */
export async function findUsersGoingToSameEvents(
  userId: string,
  limit: number = 20
): Promise<User[]> {
  // Get events user is going to
  const { data: userEvents } = await supabase
    .from('event_attendees')
    .select('event_id')
    .eq('user_id', userId)
    .eq('status', 'going');

  if (!userEvents || userEvents.length === 0) {
    return [];
  }

  const eventIds = userEvents.map(e => e.event_id);

  // Find other users going to the same events
  const { data, error } = await supabase
    .from('event_attendees')
    .select(`
      user_id,
      profiles!event_attendees_user_id_fkey(*)
    `)
    .in('event_id', eventIds)
    .eq('status', 'going')
    .neq('user_id', userId);

  if (error) throw error;

  // Group by user_id and count mutual events
  const userMap = new Map<string, { count: number; profile: any }>();
  (data || []).forEach((item: any) => {
    const uid = item.user_id;
    if (!userMap.has(uid)) {
      userMap.set(uid, { count: 0, profile: item.profiles });
    }
    userMap.get(uid)!.count += 1;
  });

  // Sort by mutual event count and transform
  return Array.from(userMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ profile }) => {
      if (!profile) return null;
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
    })
    .filter((u): u is User => u !== null);
}

/**
 * Find friends of friends (mutual connections)
 */
export async function findFriendsOfFriends(
  userId: string,
  limit: number = 20
): Promise<User[]> {
  // Get user's following list
  const { data: following } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);

  if (!following || following.length === 0) {
    return [];
  }

  const followingIds = following.map(f => f.following_id);

  // Get who those users are following (excluding current user and already followed)
  const { data, error } = await supabase
    .from('follows')
    .select(`
      following_id,
      profiles!follows_following_id_fkey(*)
    `)
    .in('follower_id', followingIds)
    .neq('following_id', userId)
    .not('following_id', 'in', `(${followingIds.join(',')})`);

  if (error) throw error;

  // Group by user_id and count mutual connections
  const userMap = new Map<string, { count: number; profile: any }>();
  (data || []).forEach((item: any) => {
    const uid = item.following_id;
    if (!userMap.has(uid)) {
      userMap.set(uid, { count: 0, profile: item.profiles });
    }
    userMap.get(uid)!.count += 1;
  });

  // Sort by mutual connection count and transform
  return Array.from(userMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ profile }) => {
      if (!profile) return null;
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
    })
    .filter((u): u is User => u !== null);
}
