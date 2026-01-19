/**
 * Eventbrite API Integration
 * Note: Eventbrite removed global search in 2019, so we use organization/venue-specific endpoints
 * Documentation: https://www.eventbrite.com/platform/api/
 */

export interface EventbriteEvent {
  id: string;
  name: {
    text: string;
    html: string;
  };
  description: {
    text: string;
    html: string;
  };
  url: string;
  start: {
    timezone: string;
    local: string;
    utc: string;
  };
  end: {
    timezone: string;
    local: string;
    utc: string;
  };
  created: string;
  changed: string;
  published: string;
  status: string;
  currency: string;
  online_event: boolean;
  organization_id: string;
  organizer_id: string;
  venue_id?: string;
  format_id?: string;
  category_id?: string;
  subcategory_id?: string;
  capacity?: number;
  capacity_is_custom?: boolean;
  logo?: {
    id: string;
    url: string;
    aspect_ratio: string;
    edge_color?: string;
    edge_color_set?: boolean;
  };
  ticket_availability: {
    has_available_tickets: boolean;
    is_sold_out: boolean;
    minimum_ticket_price?: {
      currency: string;
      value: number;
      display: string;
    };
    maximum_ticket_price?: {
      currency: string;
      value: number;
      display: string;
    };
  };
  venue?: {
    id: string;
    name: string;
    address?: {
      address_1?: string;
      address_2?: string;
      city?: string;
      region?: string;
      postal_code?: string;
      country?: string;
      localized_area_display?: string;
    };
    latitude?: string;
    longitude?: string;
  };
  organizer?: {
    id: string;
    name: string;
    description?: string;
  };
  format?: {
    id: string;
    name: string;
    short_name: string;
  };
  category?: {
    id: string;
    name: string;
    short_name: string;
  };
  subcategory?: {
    id: string;
    name: string;
    short_name: string;
  };
}

export interface EventbriteSearchResponse {
  events: EventbriteEvent[];
  pagination: {
    object_count: number;
    page_number: number;
    page_size: number;
    page_count: number;
    has_more_items: boolean;
  };
}

const API_BASE_URL = 'https://www.eventbriteapi.com/v3';

/**
 * Get API token from environment
 */
function getApiToken(): string | null {
  const token = (import.meta as any).env?.VITE_EVENTBRITE_API_TOKEN || 
         (typeof process !== 'undefined' && process.env?.VITE_EVENTBRITE_API_TOKEN) ||
         null;
  // Trim whitespace and newlines from token
  return token ? token.trim() : null;
}

/**
 * Search events by organization ID
 * You'll need to maintain a list of popular organizations/venues per city
 */
export async function searchEventsByOrganization(
  organizationId: string,
  options: {
    status?: string; // 'live', 'started', 'ended', 'completed', 'canceled'
    order_by?: string; // 'start_asc', 'start_desc', 'created_asc', 'created_desc'
    page_size?: number; // max 100
    page?: number;
  } = {}
): Promise<EventbriteSearchResponse> {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:137',message:'searchEventsByOrganization called',data:{organizationId,pageSize:options.page_size,page:options.page,status:options.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  
  const token = getApiToken();
  if (!token) {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:141',message:'No API token found',data:{organizationId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    // Return empty results instead of throwing
    return { events: [], pagination: { object_count: 0, page_number: 1, page_size: 0, page_count: 0, has_more_items: false } };
  }

  try {
    // Use Supabase Edge Function if available, otherwise fallback to direct API
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    
    if (supabaseUrl) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:149',message:'Attempting Edge Function call',data:{organizationId,supabaseUrl:supabaseUrl.substring(0,30)+'...'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      // Use Supabase Edge Function (solves CORS)
      const { invokeSupabaseFunction } = await import('../lib/supabase');
      try {
        const data = await invokeSupabaseFunction<EventbriteSearchResponse>('eventbrite-proxy', {
          organizationId,
          pageSize: options.page_size || 50,
          page: options.page || 1,
          status: options.status || 'live',
        });
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:157',message:'Edge Function success',data:{organizationId,eventCount:data?.events?.length||0,pagination:data?.pagination,hasEvents:!!data?.events?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        if (import.meta.env.DEV && data?.events?.length === 0) {
          console.log(`Eventbrite: Edge Function returned empty events for org ${organizationId}. Pagination:`, data?.pagination);
        }
        return data;
      } catch (supabaseError: any) {
        const statusCode = supabaseError?.statusCode || supabaseError?.status || supabaseError?.context?.status;
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:171',message:'Edge Function failed, falling back',data:{organizationId,errorMessage:supabaseError?.message||'unknown',errorStatus:statusCode||'unknown',errorCode:supabaseError?.code||'unknown',errorName:supabaseError?.name,errorKeys:Object.keys(supabaseError||{}).slice(0,10)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // If Edge Function returned 401 (Unauthorized), 429 (Rate Limit), or 500 (Server Error), don't fallback to direct API
        // 401 means Edge Function needs anonymous access configured
        // 429 means we're already rate limited
        // 500 means server-side issue (token not configured, etc.) - don't fallback
        if (statusCode === 401 || statusCode === 429 || statusCode === 500) {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:180',message:'Edge Function error, skipping fallback',data:{organizationId,statusCode,errorMessage:supabaseError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          if (import.meta.env.DEV) {
            if (statusCode === 401) {
              console.warn(`Eventbrite Edge Function returned 401. Edge Function needs anonymous access enabled in Supabase dashboard.`);
            } else if (statusCode === 500) {
              console.warn(`Eventbrite Edge Function returned 500. Check if EVENTBRITE_API_TOKEN secret is set correctly.`);
            }
          }
          return { events: [], pagination: { object_count: 0, page_number: 1, page_size: 0, page_count: 0, has_more_items: false } };
        }
        
        // If we don't have a status code, assume it's a general error and don't fallback
        // This prevents hitting rate limits when Edge Function has other issues
        if (!statusCode) {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:194',message:'Edge Function failed with unknown status, skipping fallback',data:{organizationId,errorMessage:supabaseError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          if (import.meta.env.DEV) {
            console.warn('Supabase function failed with unknown status, skipping direct API fallback to avoid rate limits:', supabaseError);
          }
          return { events: [], pagination: { object_count: 0, page_number: 1, page_size: 0, page_count: 0, has_more_items: false } };
        }
        
        // Fallback to direct API if Supabase function fails (but not for 401/429/unknown)
        if (import.meta.env.DEV) {
          console.warn('Supabase function failed, falling back to direct API:', supabaseError);
        }
      }
    }

    // Fallback: Direct API call
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:167',message:'Using direct API fallback',data:{organizationId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    const params = new URLSearchParams({
      token: token.trim(),
      page_size: String(options.page_size || 50),
      page: String(options.page || 1),
      order_by: options.order_by || 'start_asc',
    });

    if (options.status) {
      params.append('status', options.status);
    }

    const response = await fetch(`${API_BASE_URL}/organizations/${organizationId}/events/?${params.toString()}`);
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:180',message:'Direct API response received',data:{organizationId,status:response.status,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    if (!response.ok) {
      // #region agent log
      const errorText = await response.text().catch(() => '');
      fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:184',message:'Direct API error',data:{organizationId,status:response.status,errorText:errorText.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // If 401 (unauthorized), 403 (forbidden), or 404 (not found), fail silently
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        return { events: [], pagination: { object_count: 0, page_number: 1, page_size: 0, page_count: 0, has_more_items: false } };
      }
      // If 429 (rate limit), return empty results with rate limit flag
      if (response.status === 429) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:191',message:'Rate limit hit (429)',data:{organizationId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        if (import.meta.env.DEV) {
          console.warn(`Eventbrite API rate limit (429) for org ${organizationId}. Consider reducing request frequency.`);
        }
        // Return empty results with rate limit flag
        const emptyResult: any = { events: [], pagination: { object_count: 0, page_number: 1, page_size: 0, page_count: 0, has_more_items: false } };
        emptyResult.isRateLimit = true;
        return emptyResult;
      }
      if (import.meta.env.DEV) {
        console.warn(`Eventbrite API error for org ${organizationId}: ${response.status} - ${errorText}`);
      }
      return { events: [], pagination: { object_count: 0, page_number: 1, page_size: 0, page_count: 0, has_more_items: false } };
    }

    const data = await response.json();
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:193',message:'Direct API success',data:{organizationId,eventCount:data?.events?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return data as EventbriteSearchResponse;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(`Error fetching Eventbrite events for org ${organizationId}:`, error);
    }
    return { events: [], pagination: { object_count: 0, page_number: 1, page_size: 0, page_count: 0, has_more_items: false } };
  }
}

/**
 * Search events by venue ID
 */
export async function searchEventsByVenue(
  venueId: string,
  options: {
    status?: string;
    order_by?: string;
    page_size?: number;
    page?: number;
  } = {}
): Promise<EventbriteSearchResponse> {
  const token = getApiToken();
  if (!token) {
    // Return empty results instead of throwing
    return { events: [], pagination: { object_count: 0, page_number: 1, page_size: 0, page_count: 0, has_more_items: false } };
  }

  const params = new URLSearchParams({
    token,
    page_size: String(options.page_size || 50),
    page: String(options.page || 1),
    order_by: options.order_by || 'start_asc',
  });

  if (options.status) {
    params.append('status', options.status);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/venues/${venueId}/events/?${params.toString()}`);
    
    if (!response.ok) {
      // If 401 (unauthorized), 403 (forbidden), or 404 (not found), fail silently
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        return { events: [], pagination: { object_count: 0, page_number: 1, page_size: 0, page_count: 0, has_more_items: false } };
      }
      const errorText = await response.text();
      // Only log in development
      if (import.meta.env.DEV) {
        console.warn(`Eventbrite API error for venue ${venueId}: ${response.status} - ${errorText}`);
      }
      return { events: [], pagination: { object_count: 0, page_number: 1, page_size: 0, page_count: 0, has_more_items: false } };
    }

    const data = await response.json();
    return data as EventbriteSearchResponse;
  } catch (error) {
    // Only log in development, fail silently in production
    if (import.meta.env.DEV) {
      console.warn(`Error fetching Eventbrite events for venue ${venueId}:`, error);
    }
    return { events: [], pagination: { object_count: 0, page_number: 1, page_size: 0, page_count: 0, has_more_items: false } };
  }
}

/**
 * Convert Eventbrite event to Inner City Event format
 */
export function convertEventbriteEventToInnerCity(
  ebEvent: EventbriteEvent,
  cityId: string,
  organizerId: string = 'eventbrite'
): any {
  const imageUrl = ebEvent.logo?.url || 'https://picsum.photos/800/600';
  
  const startDate = new Date(ebEvent.start.local);
  const endDate = new Date(ebEvent.end.local);

  // Determine tier based on event status and organizer
  let tier: 'official' | 'community' | 'underground' = 'community';
  if (ebEvent.organizer?.name && ebEvent.organizer.name.toLowerCase().includes('official')) {
    tier = 'official';
  } else if (ebEvent.category?.name?.toLowerCase().includes('music') || 
             ebEvent.subcategory?.name?.toLowerCase().includes('electronic')) {
    tier = 'underground';
  }

  // Build full address
  const addressParts = [
    ebEvent.venue?.address?.address_1,
    ebEvent.venue?.address?.address_2,
    ebEvent.venue?.address?.city,
    ebEvent.venue?.address?.region,
    ebEvent.venue?.address?.postal_code,
    ebEvent.venue?.address?.country
  ].filter(Boolean);
  const fullAddress = addressParts.length > 0 
    ? addressParts.join(', ')
    : ebEvent.venue?.address?.localized_area_display || '';

  // Extract price range from ticket availability
  const priceRanges = ebEvent.ticket_availability?.minimum_ticket_price && ebEvent.ticket_availability?.maximum_ticket_price
    ? [{
        type: 'standard',
        currency: ebEvent.currency || 'USD',
        min: ebEvent.ticket_availability.minimum_ticket_price.value / 100, // Convert cents to dollars
        max: ebEvent.ticket_availability.maximum_ticket_price.value / 100,
      }]
    : undefined;

  // Build rich description with all available information
  const buildLongDesc = () => {
    // Start with Eventbrite's description if available, otherwise use name
    const parts: string[] = [];
    
    if (ebEvent.description?.text && ebEvent.description.text.trim().length > 0) {
      // Use Eventbrite's description as base, but enhance it
      const desc = ebEvent.description.text.trim();
      // Limit description length to avoid overly long text
      const maxLength = 500;
      if (desc.length > maxLength) {
        parts.push(desc.substring(0, maxLength) + '...');
      } else {
        parts.push(desc);
      }
    } else {
      parts.push(ebEvent.name.text);
    }
    
    // Add category/format info
    const categoryInfo: string[] = [];
    if (ebEvent.category?.name) {
      categoryInfo.push(ebEvent.category.name);
    }
    if (ebEvent.subcategory?.name && ebEvent.subcategory.name !== ebEvent.category?.name) {
      categoryInfo.push(ebEvent.subcategory.name);
    }
    if (ebEvent.format?.name && !categoryInfo.includes(ebEvent.format.name)) {
      categoryInfo.push(ebEvent.format.name);
    }
    if (categoryInfo.length > 0) {
      parts.push(`• ${categoryInfo.join(' / ')}`);
    }
    
    // Add date/time info
    const eventDate = new Date(ebEvent.start.local);
    const dateStr = eventDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const timeStr = eventDate.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    parts.push(`• ${dateStr} at ${timeStr}`);
    
    // Add venue info
    if (ebEvent.venue?.name && !ebEvent.online_event) {
      parts.push(`• At ${ebEvent.venue.name}`);
      if (ebEvent.venue.address?.localized_area_display) {
        parts.push(`• ${ebEvent.venue.address.localized_area_display}`);
      }
    } else if (ebEvent.online_event) {
      parts.push(`• Online Event`);
    }
    
    // Add price info
    if (ebEvent.ticket_availability.minimum_ticket_price) {
      const minPrice = ebEvent.ticket_availability.minimum_ticket_price.display;
      const maxPrice = ebEvent.ticket_availability.maximum_ticket_price?.display;
      
      if (minPrice === maxPrice) {
        parts.push(`• Tickets from ${minPrice}`);
      } else if (maxPrice) {
        parts.push(`• Tickets ${minPrice} - ${maxPrice}`);
      } else {
        parts.push(`• Tickets from ${minPrice}`);
      }
    }
    
    // Add capacity info if available
    if (ebEvent.capacity && ebEvent.capacity > 0) {
      parts.push(`• Capacity: ${ebEvent.capacity.toLocaleString()} attendees`);
    }
    
    // Add organizer info
    if (ebEvent.organizer?.name) {
      parts.push(`• Organized by ${ebEvent.organizer.name}`);
    }
    
    return parts.join(' ');
  };

  return {
    id: `eb_${ebEvent.id}`,
    cityId,
    organizerId: organizerId || ebEvent.organizer_id,
    tier,
    title: ebEvent.name.text,
    shortDesc: ebEvent.category?.name || ebEvent.format?.name || 'Event',
    longDesc: buildLongDesc(),
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
    venueName: ebEvent.venue?.name || (ebEvent.online_event ? 'Online Event' : 'Venue TBA'),
    address: fullAddress,
    lat: ebEvent.venue?.latitude ? parseFloat(ebEvent.venue.latitude) : 0,
    lng: ebEvent.venue?.longitude ? parseFloat(ebEvent.venue.longitude) : 0,
    categories: [ebEvent.category?.name || 'General'],
    subcategories: [ebEvent.subcategory?.name || ebEvent.format?.name || ''],
    mediaUrls: [imageUrl],
    ticketUrl: ebEvent.url,
    eventbriteId: ebEvent.id,
    status: ebEvent.status === 'live' ? 'active' as const : 'active' as const,
    counts: {
      likes: 0,
      saves: 0,
      comments: 0,
      rsvpGoing: 0,
      rsvpInterested: 0,
    },
    // Additional Eventbrite fields
    priceRanges,
    onlineEvent: ebEvent.online_event,
    capacity: ebEvent.capacity,
    currency: ebEvent.currency,
    promoter: ebEvent.organizer ? {
      id: ebEvent.organizer.id,
      name: ebEvent.organizer.name,
    } : undefined,
    timezone: ebEvent.start.timezone,
  };
}

/**
 * Popular organizations/venues by city
 * You'll need to populate this with actual organization IDs from Eventbrite
 */
export const CITY_ORGANIZATIONS: Record<string, string[]> = {
  'Berlin': [
    // No valid organizations found
  ],
  'London': [
    // No valid organizations found
  ],
  'New York': [
    // No valid organizations found
  ],
  'Los Angeles': [
    // Add Eventbrite organization IDs for LA
  ],
  'Vancouver': [
    // No valid organizations found
  ],
  'Calgary': [
    // No valid organizations found
  ],
  'Tokyo': [
    // No valid organizations found
  ],
};

/**
 * Search events for a city using known organizations
 */
export async function searchEventsByCity(
  cityName: string,
  options: {
    status?: string;
    page_size?: number;
  } = {}
): Promise<EventbriteEvent[]> {
  const organizations = CITY_ORGANIZATIONS[cityName] || [];
  
  // Log warning if no organizations found for city
  if (organizations.length === 0) {
    if (import.meta.env.DEV) {
      console.warn(`No Eventbrite organizations configured for city: ${cityName}`);
    }
    return [];
  }

  const allEvents: EventbriteEvent[] = [];
  const token = getApiToken();
  
  if (!token) {
    if (import.meta.env.DEV) {
      console.warn('Eventbrite API token not configured. Set VITE_EVENTBRITE_API_TOKEN in your environment.');
    }
    return [];
  }

  // Add rate limiting: delay between requests to avoid 429 errors
  // Eventbrite rate limit is strict - use 2.5 second delay to be safe
  const delayBetweenRequests = 2500; // 2.5 second delay = ~0.4 requests/second (well under Eventbrite's limit)
  let consecutiveRateLimits = 0;
  const maxConsecutiveRateLimits = 3; // Stop after 3 consecutive rate limits
  let consecutive404s = 0;
  const maxConsecutive404s = 5; // Stop after 5 consecutive 404s (invalid org IDs)
  
  // Limit number of organizations to avoid hitting rate limits
  // Query top organizations first (they're likely to have more events)
  // Increase limit since many might be invalid (404)
  const maxOrganizations = 30; // Try more organizations since many might return 404
  const limitedOrganizations = organizations.slice(0, maxOrganizations);
  
  for (let i = 0; i < limitedOrganizations.length; i++) {
    const orgId = limitedOrganizations[i];
    try {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:763',message:'Fetching org events',data:{cityName,orgId,orgIndex:i+1,totalOrgs:limitedOrganizations.length,consecutiveRateLimits},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      // Stop if we've hit too many consecutive rate limits
      if (consecutiveRateLimits >= maxConsecutiveRateLimits) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:770',message:'Stopping due to consecutive rate limits',data:{cityName,consecutiveRateLimits,processed:i,totalOrganizations:limitedOrganizations.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        if (import.meta.env.DEV) {
          console.warn(`Eventbrite: Stopping after ${consecutiveRateLimits} consecutive rate limits. Processed ${i} of ${limitedOrganizations.length} organizations.`);
        }
        break;
      }
      
      // Stop if we've hit too many consecutive 404s (invalid organization IDs)
      if (consecutive404s >= maxConsecutive404s) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:777',message:'Stopping due to consecutive 404s',data:{cityName,consecutive404s,processed:i,totalOrganizations:limitedOrganizations.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        if (import.meta.env.DEV) {
          console.warn(`Eventbrite: Stopping after ${consecutive404s} consecutive 404s (invalid organization IDs). Processed ${i} of ${limitedOrganizations.length} organizations. Found ${allEvents.length} total events.`);
        }
        break;
      }
      
      // Add delay between requests (except for first one)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
      }
      
      const response = await searchEventsByOrganization(orgId, {
        status: options.status || 'live',
        page_size: options.page_size || 20,
      });
      
      // Check if this was a 404 (organization doesn't exist)
      // Edge Function returns empty events array for 404, so we check pagination
      const is404 = response.pagination?.object_count === 0 && 
                    response.events?.length === 0 &&
                    (response as any)?.is404;
      
      // Track rate limits from response
      if ((response as any)?.isRateLimit) {
        consecutiveRateLimits++;
        consecutive404s = 0; // Reset 404 counter on rate limit
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:790',message:'Rate limit in response',data:{cityName,orgId,consecutiveRateLimits},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
      } else if (is404) {
        // Track consecutive 404s (invalid organization IDs)
        consecutive404s++;
        consecutiveRateLimits = 0; // Reset rate limit counter on 404
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:797',message:'404 - Organization not found',data:{cityName,orgId,consecutive404s},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        if (import.meta.env.DEV) {
          console.log(`Eventbrite: Organization ${orgId} returned 404 (not found). Skipping.`);
        }
      } else {
        // Reset both counters on success
        consecutiveRateLimits = 0;
        consecutive404s = 0;
        if (response && response.events && response.events.length > 0) {
          allEvents.push(...response.events);
          if (import.meta.env.DEV) {
            console.log(`Eventbrite: Found ${response.events.length} events for org ${orgId} in ${cityName}`);
          }
        }
      }
    } catch (error: any) {
      // Track consecutive rate limits from errors
      if (error?.isRateLimit || error?.statusCode === 429) {
        consecutiveRateLimits++;
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:800',message:'Rate limit error caught',data:{cityName,orgId,consecutiveRateLimits},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
      } else {
        // Reset on non-rate-limit errors
        consecutiveRateLimits = 0;
      }
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:797',message:'Org fetch error',data:{cityName,orgId,errorMessage:error instanceof Error?error.message:'unknown',isRateLimit:error?.isRateLimit||false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // Log errors in development
      if (import.meta.env.DEV) {
        console.warn(`Failed to fetch events for organization ${orgId} in ${cityName}:`, error);
      }
    }
  }

  if (import.meta.env.DEV && allEvents.length === 0 && limitedOrganizations.length > 0) {
    console.warn(`Eventbrite: No events found for ${cityName} despite ${limitedOrganizations.length} organizations queried (${organizations.length} total configured). Check API token and organization IDs.`);
  }

  return allEvents;
}
