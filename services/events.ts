/**
 * Events Service
 * Handles creating and managing user-generated events
 */

import { supabase } from '../lib/supabase';
import { Event } from '../types';

export interface CreateEventData {
  title: string;
  shortDesc?: string;
  longDesc?: string;
  startAt: string; // ISO 8601
  endAt: string; // ISO 8601
  cityId: string;
  venueName: string;
  address?: string;
  lat?: number;
  lng?: number;
  categories: string[];
  subcategories?: string[];
  mediaUrls?: string[];
  ticketUrl?: string;
  organizationId?: string;
  tier?: 'community' | 'official' | 'underground';
}

/**
 * Create a user-generated event
 */
export async function createUserEvent(
  userId: string,
  eventData: CreateEventData
): Promise<Event> {
  const { data, error } = await supabase
    .from('events')
    .insert({
      source: 'user',
      city_id: eventData.cityId,
      organizer_id: userId,
      organization_id: eventData.organizationId || null,
      tier: eventData.tier || 'community',
      title: eventData.title,
      short_desc: eventData.shortDesc,
      long_desc: eventData.longDesc,
      start_at: eventData.startAt,
      end_at: eventData.endAt,
      venue_name: eventData.venueName,
      address: eventData.address,
      lat: eventData.lat,
      lng: eventData.lng,
      categories: eventData.categories,
      subcategories: eventData.subcategories || [],
      media_urls: eventData.mediaUrls || [],
      ticket_url: eventData.ticketUrl,
      status: 'active',
    })
    .select()
    .single();

  if (error) throw error;

  return transformEvent(data);
}

/**
 * Update a user-generated event
 */
export async function updateUserEvent(
  eventId: string,
  userId: string,
  updates: Partial<CreateEventData>
): Promise<Event> {
  // Verify user owns the event
  const { data: existing } = await supabase
    .from('events')
    .select('organizer_id')
    .eq('id', eventId)
    .single();

  if (!existing || existing.organizer_id !== userId) {
    throw new Error('Unauthorized: You can only update your own events');
  }

  const updateData: any = {};
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.shortDesc !== undefined) updateData.short_desc = updates.shortDesc;
  if (updates.longDesc !== undefined) updateData.long_desc = updates.longDesc;
  if (updates.startAt !== undefined) updateData.start_at = updates.startAt;
  if (updates.endAt !== undefined) updateData.end_at = updates.endAt;
  if (updates.venueName !== undefined) updateData.venue_name = updates.venueName;
  if (updates.address !== undefined) updateData.address = updates.address;
  if (updates.lat !== undefined) updateData.lat = updates.lat;
  if (updates.lng !== undefined) updateData.lng = updates.lng;
  if (updates.categories !== undefined) updateData.categories = updates.categories;
  if (updates.subcategories !== undefined) updateData.subcategories = updates.subcategories;
  if (updates.mediaUrls !== undefined) updateData.media_urls = updates.mediaUrls;
  if (updates.ticketUrl !== undefined) updateData.ticket_url = updates.ticketUrl;
  if (updates.organizationId !== undefined) updateData.organization_id = updates.organizationId;
  if (updates.tier !== undefined) updateData.tier = updates.tier;

  const { data, error } = await supabase
    .from('events')
    .update(updateData)
    .eq('id', eventId)
    .select()
    .single();

  if (error) throw error;
  return transformEvent(data);
}

/**
 * Delete a user-generated event
 */
export async function deleteUserEvent(eventId: string, userId: string): Promise<void> {
  // Verify user owns the event
  const { data: existing } = await supabase
    .from('events')
    .select('organizer_id')
    .eq('id', eventId)
    .single();

  if (!existing || existing.organizer_id !== userId) {
    throw new Error('Unauthorized: You can only delete your own events');
  }

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId);

  if (error) throw error;
}

function transformEvent(data: any): Event {
  return {
    id: data.id,
    cityId: data.city_id,
    organizerId: data.organizer_id,
    organizationId: data.organization_id,
    tier: data.tier,
    title: data.title,
    shortDesc: data.short_desc,
    longDesc: data.long_desc,
    startAt: data.start_at,
    endAt: data.end_at,
    venueName: data.venue_name,
    address: data.address || '',
    lat: data.lat || 0,
    lng: data.lng || 0,
    categories: data.categories || [],
    subcategories: data.subcategories || [],
    mediaUrls: data.media_urls || [],
    ticketUrl: data.ticket_url,
    ticketmasterId: data.external_id,
    eventbriteId: data.external_id,
    status: data.status,
    counts: data.counts || { likes: 0, saves: 0, comments: 0, rsvpGoing: 0, rsvpInterested: 0 },
  };
}
