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
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:157',message:'Edge Function success',data:{organizationId,eventCount:data?.events?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        return data;
      } catch (supabaseError: any) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:160',message:'Edge Function failed, falling back',data:{organizationId,errorMessage:supabaseError?.message||'unknown',errorStatus:supabaseError?.status||'unknown',errorCode:supabaseError?.code||'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        // Fallback to direct API if Supabase function fails
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
      // If 429 (rate limit), return empty results and log warning
      if (response.status === 429) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:191',message:'Rate limit hit (429)',data:{organizationId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        if (import.meta.env.DEV) {
          console.warn(`Eventbrite API rate limit (429) for org ${organizationId}. Consider reducing request frequency.`);
        }
        return { events: [], pagination: { object_count: 0, page_number: 1, page_size: 0, page_count: 0, has_more_items: false } };
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
    '18147223532',
    '85950258523',
    '20249008757',
    '42340492183',
    '30583119682',
    '48687361433',
    '50794730473',
    '118974152861',
    '112438753071',
    '61677601013',
    '120714547940',
    '7983092193',
    '2306625137',
    '50013368963',
    '112556682841',
    '12448110053',
    '30273710876',
    '30164999184',
    '2319663773',
    '25052159091',
    '18594831004',
    '105976471551',
    '33895977485',
    '47961807863',
    '30045262856',
    '52798408723',
    '99895128061',
    '77447754723',
    '69356207623',
    '55412802263',
    '54200948253',
    '37935491523',
    '17165660352',
    '85602833453',
    '60238326123',
    '33827739137',
    '118219537271',
    '50691049753',
    '69837130683',
    '66795154873',
    '82815064723',
    '120800866973',
    '77256716753',
    '37777060213',
    '105571405801',
    '60108695013',
    '104453253141',
    '105693997981',
    '44885281883',
    '120764551532',
    '49288622',
    '120677048267',
    '66792456113',
    '17817834839',
    '53004078403',
    '66977875023',
    '117817462311',
    '80759858283',
    '83884780683',
    '59070860673',
    '83671608853',
    '29395158761'
  ],
  'London': [
    '1687814311173',
    '17842962510',
    '91946701843',
    '35982868173',
    '75640028603',
    '40849910643',
    '17505726266',
    '39847240743',
    '2900438939',
    '19991528927',
    '37663218863',
    '34524611333',
    '31358530829',
    '17825575648',
    '80426088133',
    '51402283783',
    '16457805814',
    '69316048463',
    '2565562096',
    '28800164755',
    '17663639978',
    '120787346991',
    '17966121631',
    '18520402627',
    '12003278880',
    '109891506291',
    '17225587929',
    '27647524359',
    '6181738369',
    '30505316848',
    '110370193811',
    '33892591951',
    '87783199923',
    '12803748215',
    '5887911881',
    '120354377271',
    '35795829',
    '8559642994',
    '93695911193',
    '98926535041',
    '18565949237'
  ],
  'New York': [
    '13957631249',
    '86136754923',
    '9789186973',
    '6140247955',
    '8012469404',
    '5494940201',
    '3289538704',
    '50978487833',
    '2045320721',
    '6807580813',
    '17106924056',
    '31025401131',
    '60036372273',
    '13659290380',
    '40146128413',
    '13877447867',
    '13794689586',
    '1646273810',
    '58374016673',
    '12617770420',
    '60937627203',
    '35701633213',
    '71032912973',
    '120761670505',
    '115382596731',
    '17225587929',
    '27647524359',
    '6181738369',
    '30505316848',
    '110370193811',
    '33892591951',
    '87783199923',
    '12803748215',
    '33666047161',
    '93715728953',
    '4279966505',
    '66147754573',
    '109511595401',
    '105655500371',
    '110999558741',
    '120805881833'
  ],
  'Los Angeles': [
    // Add Eventbrite organization IDs for LA
  ],
  'Vancouver': [
    '2943850379711',
    '120831497899',
    '34871563113',
    '87690002073',
    '59178760723',
    '9484299597',
    '37276933663',
    '75820795173',
    '93303090563',
    '119476444461',
    '77280653143',
    '120831069924',
    '12281209873',
    '59327444273',
    '57337400803',
    '106815795981',
    '16030559882',
    '60099430613',
    '2772244818',
    '32899867183',
    '30273710876',
    '112556682841',
    '12448110053',
    '28551465965',
    '2319663773',
    '90433442663',
    '5687498741',
    '30942772753',
    '30830903109',
    '63157921223',
    '80331339503',
    '63403105583',
    '82620381413'
  ],
  'Calgary': [
    '2835847444521',
    '59517535663',
    '4115384439',
    '31525163147',
    '17542473710',
    '113774256611',
    '50372314113',
    '16030559882',
    '18116068966',
    '17376122345',
    '4534018507',
    '100788105451',
    '9377090349',
    '33867485427',
    '33377471171',
    '12448110053',
    '44844296983',
    '81614408553',
    '17437217035',
    '8503627612',
    '120823764139',
    '59290608213',
    '36582133873',
    '120790883575',
    '17371048072',
    '95698370973',
    '83879403303',
    '1251148157',
    '17906771065',
    '13412231993',
    '22927194740',
    '71945234833',
    '32808320813',
    '18437233490',
    '35293053033',
    '81021758843',
    '71670787053',
    '114121661541',
    '120769869499',
    '115211708831',
    '15659791545',
    '19690461102',
    '70713673833',
    '69730600153',
    '17103752006',
    '120237444431',
    '51570080193',
    '21609830291',
    '120723362211',
    '103964797721',
    '46467278883',
    '45905765613',
    '41606449603',
    '115669954251',
    '5869493851',
    '102376456621',
    '16620811925',
    '74198477893',
    '58852804893',
    '61074770533',
    '67405557993',
    '8436980324',
    '40276504703'
  ],
  'Tokyo': [
    '108288342151',
    '30753745762',
    '109788540541',
    '72310423383',
    '55778202283',
    '18060231823',
    '17262732131',
    '33768011953',
    '2306625137',
    '50013368963',
    '112556682841',
    '12448110053',
    '30273710876',
    '30164999184',
    '2319663773',
    '25052159091',
    '120129604801',
    '14672487458',
    '29827792143',
    '42742154273',
    '120862009999',
    '120664671230',
    '120810054841',
    '120801069380',
    '55116119923',
    '120873920795',
    '68239424483',
    '26470685753',
    '120780505433',
    '30368570276',
    '109361159671',
    '48778202903',
    '108066308721',
    '111612721041',
    '20086254396',
    '120738261783',
    '114950734711',
    '10941324876',
    '11123434784',
    '72007890373'
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
  const delayBetweenRequests = 200; // 200ms delay = ~5 requests/second (well under Eventbrite's limit)
  
  for (let i = 0; i < organizations.length; i++) {
    const orgId = organizations[i];
    try {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:763',message:'Fetching org events',data:{cityName,orgId,orgIndex:i+1,totalOrgs:organizations.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      // Add delay between requests (except for first one)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
      }
      
      const response = await searchEventsByOrganization(orgId, {
        status: options.status || 'live',
        page_size: options.page_size || 20,
      });
      if (response && response.events && response.events.length > 0) {
        allEvents.push(...response.events);
        if (import.meta.env.DEV) {
          console.log(`Eventbrite: Found ${response.events.length} events for org ${orgId} in ${cityName}`);
        }
      }
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'eventbrite.ts:777',message:'Org fetch error',data:{cityName,orgId,errorMessage:error instanceof Error?error.message:'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // Log errors in development
      if (import.meta.env.DEV) {
        console.warn(`Failed to fetch events for organization ${orgId} in ${cityName}:`, error);
      }
    }
  }

  if (import.meta.env.DEV && allEvents.length === 0 && organizations.length > 0) {
    console.warn(`Eventbrite: No events found for ${cityName} despite ${organizations.length} organizations configured. Check API token and organization IDs.`);
  }

  return allEvents;
}
