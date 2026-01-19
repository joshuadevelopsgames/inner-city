/**
 * Pulse Feed Service
 * 
 * Aggregates and ranks Pulse feed items (posts, check-ins, plans, spots, drops, events)
 * for the active city. Events appear as recommendations interleaved sparsely.
 */

import { supabase } from '../lib/supabase';
import { UserPost, Event, PulseItem, RecommendedEvent, User } from '../types';
import { getRecommendedEvents } from './eventRecommendations';
import { getFeedPosts } from './social';
import { checkInToEvent, getEventCheckIns } from './social';

export interface PulseFeedOptions {
  userId: string;
  cityId: string;
  limit?: number;
  userLatLng?: { lat: number; lng: number };
  includeEvents?: boolean; // Whether to include recommended events
  eventInterleaveRatio?: number; // Interleave 1 event every N items (default: 10)
}

export interface PulseFeedResult {
  items: PulseItem[];
  hasMore: boolean;
}

/**
 * Get Pulse feed for a city
 */
export async function getPulseFeed(
  options: PulseFeedOptions
): Promise<PulseFeedResult> {
  const {
    userId,
    cityId,
    limit = 50,
    userLatLng,
    includeEvents = true,
    eventInterleaveRatio = 10,
  } = options;

  const now = new Date();
  const items: PulseItem[] = [];

  // 1. Fetch posts (all types) for the city, excluding expired content
  const { data: posts, error: postsError } = await supabase
    .from('user_posts')
    .select(`
      *,
      events(*),
      organizations(*)
    `)
    .eq('city_id', cityId)
    .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(limit * 2); // Fetch more to account for filtering

  if (postsError) {
    console.error('Error fetching posts:', postsError);
  }

  // Transform posts to PulseItems
  if (posts) {
    // Fetch user profiles for posts
    const userIds = [...new Set(posts.map((p: any) => p.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', userIds);

    const profilesMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

    posts.forEach((post: any) => {
      const profile = profilesMap.get(post.user_id);
      if (!profile) return;

      // Transform post to UserPost
      const userPost: UserPost = {
        id: post.id,
        userId: post.user_id,
        eventId: post.event_id,
        organizationId: post.organization_id,
        type: post.type || 'post',
        content: post.content,
        mediaUrls: post.media_urls || [],
        likesCount: post.likes_count || 0,
        commentsCount: post.comments_count || 0,
        createdAt: post.created_at,
        updatedAt: post.updated_at,
        expiresAt: post.expires_at,
        lat: post.lat,
        lng: post.lng,
        address: post.address,
        placeName: post.place_name,
        cityId: post.city_id,
        user: {
          id: profile.id,
          username: profile.username,
          displayName: profile.display_name,
          avatarUrl: profile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.id}`,
          profilePhotos: profile.profile_photos || [],
          bio: profile.bio || '',
          socials: {},
          interests: profile.interests || [],
          homeCity: profile.home_city || '',
          travelCities: profile.travel_cities || [],
          profileMode: profile.profile_mode || 'full',
          organizerTier: profile.organizer_tier || 'none',
          verified: profile.verified || false,
          createdAt: profile.created_at,
        },
        event: post.events ? {
          id: post.events.id,
          cityId: post.events.city_id,
          organizerId: post.events.organizer_id || '',
          organizationId: post.events.organization_id,
          tier: post.events.tier,
          title: post.events.title,
          shortDesc: post.events.short_desc || '',
          longDesc: post.events.long_desc || '',
          startAt: post.events.start_at,
          endAt: post.events.end_at,
          venueName: post.events.venue_name || '',
          address: post.events.address || '',
          lat: post.events.lat || 0,
          lng: post.events.lng || 0,
          categories: post.events.categories || [],
          subcategories: post.events.subcategories || [],
          mediaUrls: post.events.media_urls || [],
          ticketUrl: post.events.ticket_url,
          ticketmasterId: post.events.ticketmaster_id,
          eventbriteId: post.events.eventbrite_id,
          status: post.events.status,
          counts: post.events.counts || {
            likes: 0,
            saves: 0,
            comments: 0,
            rsvpGoing: 0,
            rsvpInterested: 0,
          },
        } : undefined,
      };

      // For check-ins, include event data
      if (post.type === 'checkin' && post.events) {
        items.push({
          type: 'checkin',
          id: post.id,
          createdAt: post.created_at,
          data: {
            type: 'checkin',
            post: userPost,
            event: userPost.event!,
          },
        });
      } else {
        items.push({
          type: post.type || 'post',
          id: post.id,
          createdAt: post.created_at,
          data: userPost,
        });
      }
    });
  }

  // 2. Fetch check-ins from event_attendees (recent check-ins)
  const { data: checkIns, error: checkInsError } = await supabase
    .from('event_attendees')
    .select(`
      *,
      events(*)
    `)
    .not('checked_in_at', 'is', null)
    .eq('is_public', true)
    .order('checked_in_at', { ascending: false })
    .limit(20);

  if (!checkInsError && checkIns) {
    // Fetch user profiles for check-ins separately
    const checkInUserIds = [...new Set(checkIns.map((c: any) => c.user_id))];
    const { data: checkInProfiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', checkInUserIds);

    const checkInProfilesMap = new Map(checkInProfiles?.map((p: any) => [p.id, p]) || []);

    // Filter check-ins for events in the active city
    checkIns.forEach((checkIn: any) => {
      if (checkIn.events?.city_id === cityId) {
        const profile = checkInProfilesMap.get(checkIn.user_id);
        const checkInPost: UserPost = {
          id: `checkin-${checkIn.id}`,
          userId: checkIn.user_id,
          eventId: checkIn.event_id,
          type: 'checkin',
          content: `Checked in at ${checkIn.events?.title || 'an event'}`,
          mediaUrls: [],
          likesCount: 0,
          commentsCount: 0,
          createdAt: checkIn.checked_in_at,
          updatedAt: checkIn.checked_in_at,
          user: profile ? {
            id: profile.id,
            username: profile.username,
            displayName: profile.display_name,
            avatarUrl: profile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.id}`,
            profilePhotos: profile.profile_photos || [],
            bio: profile.bio || '',
            socials: {},
            interests: profile.interests || [],
            homeCity: profile.home_city || '',
            travelCities: profile.travel_cities || [],
            profileMode: profile.profile_mode || 'full',
            organizerTier: profile.organizer_tier || 'none',
            verified: profile.verified || false,
            createdAt: profile.created_at,
          } : undefined,
          event: checkIn.events ? {
            id: checkIn.events.id,
            cityId: checkIn.events.city_id,
            organizerId: checkIn.events.organizer_id || '',
            tier: checkIn.events.tier,
            title: checkIn.events.title,
            shortDesc: checkIn.events.short_desc || '',
            longDesc: checkIn.events.long_desc || '',
            startAt: checkIn.events.start_at,
            endAt: checkIn.events.end_at,
            venueName: checkIn.events.venue_name || '',
            address: checkIn.events.address || '',
            lat: checkIn.events.lat || 0,
            lng: checkIn.events.lng || 0,
            categories: checkIn.events.categories || [],
            subcategories: checkIn.events.subcategories || [],
            mediaUrls: checkIn.events.media_urls || [],
            ticketUrl: checkIn.events.ticket_url,
            status: checkIn.events.status,
            counts: checkIn.events.counts || {
              likes: 0,
              saves: 0,
              comments: 0,
              rsvpGoing: 0,
              rsvpInterested: 0,
            },
          } : undefined,
        };

        items.push({
          type: 'checkin',
          id: `checkin-${checkIn.id}`,
          createdAt: checkIn.checked_in_at,
          data: {
            type: 'checkin',
            post: checkInPost,
            event: checkInPost.event!,
          },
        });
      }
    });
  }

  // 3. Sort all items by createdAt (most recent first)
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // 4. Interleave recommended events if enabled
  if (includeEvents && userId) {
    try {
      const recommendedEvents = await getRecommendedEvents({
        userId,
        cityId,
        limit: Math.ceil(limit / eventInterleaveRatio) + 5, // Get a few extra for interleaving
        now,
        userLatLng,
        minScore: 5, // Only include events with decent scores
      });

      // Interleave events sporadically throughout the feed
      // Ensure events never exceed 20% of feed
      const maxEventCount = Math.floor(limit * 0.2);
      const eventsToInsert = recommendedEvents.slice(0, maxEventCount);
      
      // Create random insertion positions (avoid clustering at top)
      // Start inserting after first 5 items, distribute throughout feed
      const insertionPositions: number[] = [];
      const minGap = 3; // Minimum gap between events
      const maxGap = eventInterleaveRatio * 2; // Maximum gap between events
      
      let currentPos = 5; // Start after first 5 items
      while (currentPos < items.length && insertionPositions.length < eventsToInsert.length) {
        insertionPositions.push(currentPos);
        // Add random gap between events (more sporadic)
        const gap = Math.floor(Math.random() * (maxGap - minGap + 1)) + minGap;
        currentPos += gap;
      }
      
      // Insert events at random positions (reverse order to maintain indices)
      // Use current time for events so they don't sort to the top
      const nowISO = now.toISOString();
      insertionPositions.reverse().forEach((pos, idx) => {
        if (idx < eventsToInsert.length && pos < items.length) {
          const event = eventsToInsert[idx];
          items.splice(pos, 0, {
            type: 'event',
            id: `rec-${event.id}`,
            createdAt: nowISO, // Use current time so events stay where inserted
            data: event,
          });
        }
      });
    } catch (error) {
      console.error('Error fetching recommended events:', error);
      // Continue without events if recommendation service fails
    }
  }

  // 5. Don't re-sort after interleaving - keep events where they were inserted
  // This maintains the sporadic distribution throughout the feed
  // The feed is already sorted chronologically before event insertion

  // 6. Limit to requested size
  const limitedItems = items.slice(0, limit);

  return {
    items: limitedItems,
    hasMore: items.length > limit,
  };
}
