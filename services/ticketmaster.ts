/**
 * Ticketmaster Discovery API Integration
 * Documentation: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 */

export interface TicketmasterEvent {
  id: string;
  name: string;
  url: string;
  locale: string;
  images: Array<{
    ratio: string;
    url: string;
    width: number;
    height: number;
    fallback: boolean;
  }>;
  sales: {
    public: {
      startDateTime: string;
      endDateTime: string;
      startTBD?: boolean;
      startTBA?: boolean;
    };
  };
  dates: {
    start: {
      localDate: string;
      localTime: string;
      dateTime: string;
      dateTBD?: boolean;
      dateTBA?: boolean;
      timeTBA?: boolean;
      noSpecificTime?: boolean;
    };
    timezone: string;
    status: {
      code: string;
    };
    spanMultipleDays?: boolean;
  };
  classifications: Array<{
    primary: boolean;
    segment?: {
      id: string;
      name: string;
    };
    genre?: {
      id: string;
      name: string;
    };
    subGenre?: {
      id: string;
      name: string;
    };
  }>;
  promoter?: {
    id: string;
    name: string;
  };
  promoters?: Array<{
    id: string;
    name: string;
  }>;
  _embedded?: {
    venues: Array<{
      id: string;
      name: string;
      type: string;
      url?: string;
      locale: string;
      images?: Array<{
        ratio: string;
        url: string;
        width: number;
        height: number;
        fallback: boolean;
      }>;
      postalCode?: string;
      timezone: string;
      city: {
        name: string;
      };
      state?: {
        name: string;
        stateCode: string;
      };
      country: {
        name: string;
        countryCode: string;
      };
      address?: {
        line1: string;
        line2?: string;
      };
      location?: {
        longitude: string;
        latitude: string;
      };
      markets?: Array<{
        id: string;
        name: string;
      }>;
      dmas?: Array<{
        id: number;
        name: string;
      }>;
      boxOfficeInfo?: {
        phoneNumberDetail?: string;
        openHoursDetail?: string;
        acceptedPaymentDetail?: string;
        willCallDetail?: string;
      };
      parkingDetail?: string;
      accessibleSeatingDetail?: string;
      generalInfo?: {
        generalRule?: string;
        childRule?: string;
      };
    }>;
    attractions?: Array<{
      id: string;
      name: string;
      type: string;
      url?: string;
      locale: string;
      images?: Array<{
        ratio: string;
        url: string;
        width: number;
        height: number;
        fallback: boolean;
      }>;
    }>;
  };
  priceRanges?: Array<{
    type: string;
    currency: string;
    min: number;
    max: number;
  }>;
  ticketLimit?: {
    info: string;
  };
  ageRestrictions?: {
    legalAgeEnforced: boolean;
  };
  ticketing?: {
    safeTix?: {
      enabled: boolean;
    };
    allInclusivePricing?: {
      enabled: boolean;
    };
  };
  _links: {
    self: {
      href: string;
    };
    attractions?: Array<{
      href: string;
    }>;
    venues?: Array<{
      href: string;
    }>;
  };
}

export interface TicketmasterSearchResponse {
  _embedded?: {
    events: TicketmasterEvent[];
  };
  _links: {
    self: {
      href: string;
    };
    next?: {
      href: string;
    };
    prev?: {
      href: string;
    };
  };
  page: {
    size: number;
    totalElements: number;
    totalPages: number;
    number: number;
  };
}

const API_BASE_URL = 'https://app.ticketmaster.com/discovery/v2';

/**
 * Get API key from environment or throw error
 */
function getApiKey(): string {
  const apiKey = import.meta.env.VITE_TICKETMASTER_API_KEY || 
                 (typeof process !== 'undefined' && process.env?.VITE_TICKETMASTER_API_KEY);
  
  if (!apiKey) {
    throw new Error('TICKETMASTER_API_KEY is not configured. Please set VITE_TICKETMASTER_API_KEY in your .env.local file');
  }
  
  return apiKey;
}

/**
 * Search for events by city
 */
export async function searchEventsByCity(
  cityName: string,
  countryCode: string = 'US',
  options: {
    classificationName?: string; // e.g., 'music', 'sports', 'arts'
    startDateTime?: string; // ISO 8601 format
    endDateTime?: string; // ISO 8601 format
    size?: number; // results per page (max 200)
    page?: number;
  } = {}
): Promise<TicketmasterSearchResponse> {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    apikey: apiKey,
    city: cityName,
    countryCode,
    size: String(options.size || 20),
    page: String(options.page || 0),
    sort: 'date,asc', // Sort by date ascending
  });

  if (options.classificationName) {
    params.append('classificationName', options.classificationName);
  }

  if (options.startDateTime) {
    params.append('startDateTime', options.startDateTime);
  }

  if (options.endDateTime) {
    params.append('endDateTime', options.endDateTime);
  }

  try {
    // Use Supabase Edge Function if available, otherwise fallback to direct API
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    
    if (supabaseUrl) {
      // Use Supabase Edge Function (solves CORS)
      const { invokeSupabaseFunction } = await import('../lib/supabase');
      try {
        const data = await invokeSupabaseFunction<TicketmasterSearchResponse>('ticketmaster-proxy', {
          city: cityName,
          countryCode,
          category: options.classificationName,
          size: options.size || 20,
          page: options.page || 0,
        });
        return data;
      } catch (supabaseError) {
        // Fallback to direct API if Supabase function fails
        if (import.meta.env.DEV) {
          console.warn('Supabase function failed, falling back to direct API:', supabaseError);
        }
      }
    }

    // Fallback: Direct API call (will fail with CORS in browser, but works in dev)
    const response = await fetch(`${API_BASE_URL}/events.json?${params.toString()}`);
    
    if (!response.ok) {
      // Handle rate limiting (429) and CORS errors gracefully
      if (response.status === 429) {
        if (import.meta.env.DEV) {
          console.warn('Ticketmaster API rate limited (429). Use Supabase Edge Function.');
        }
        return { _embedded: { events: [] }, _links: { self: { href: '' } }, page: { size: 0, totalElements: 0, totalPages: 0, number: 0 } };
      }
      
      const errorText = await response.text();
      if (import.meta.env.DEV) {
        console.warn(`Ticketmaster API error: ${response.status} - ${errorText}`);
      }
      return { _embedded: { events: [] }, _links: { self: { href: '' } }, page: { size: 0, totalElements: 0, totalPages: 0, number: 0 } };
    }

    const data = await response.json();
    return data as TicketmasterSearchResponse;
  } catch (error: any) {
    // Handle CORS errors and network failures gracefully
    if (error?.message?.includes('CORS') || error?.message?.includes('Failed to fetch') || error?.name === 'TypeError') {
      if (import.meta.env.DEV) {
        console.warn('Ticketmaster API CORS error. Set up Supabase Edge Function to fix this.');
      }
      return { _embedded: { events: [] }, _links: { self: { href: '' } }, page: { size: 0, totalElements: 0, totalPages: 0, number: 0 } };
    }
    
    if (import.meta.env.DEV) {
      console.warn('Error fetching Ticketmaster events:', error);
    }
    return { _embedded: { events: [] }, _links: { self: { href: '' } }, page: { size: 0, totalElements: 0, totalPages: 0, number: 0 } };
  }
}

/**
 * Get event details by ID
 */
export async function getEventDetails(eventId: string): Promise<TicketmasterEvent> {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    apikey: apiKey,
  });

  try {
    const response = await fetch(`${API_BASE_URL}/events/${eventId}.json?${params.toString()}`);
    
    if (!response.ok) {
      // Handle rate limiting and errors gracefully
      if (response.status === 429) {
        if (import.meta.env.DEV) {
          console.warn('Ticketmaster API rate limited (429)');
        }
        throw new Error('Rate limited');
      }
      
      const errorText = await response.text();
      if (import.meta.env.DEV) {
        console.warn(`Ticketmaster API error: ${response.status} - ${errorText}`);
      }
      throw new Error(`Ticketmaster API error: ${response.status}`);
    }

    const data = await response.json();
    return data as TicketmasterEvent;
  } catch (error: any) {
    // Handle CORS errors gracefully
    if (error?.message?.includes('CORS') || error?.message?.includes('Failed to fetch') || error?.name === 'TypeError') {
      if (import.meta.env.DEV) {
        console.warn('Ticketmaster API CORS error');
      }
      throw new Error('CORS error');
    }
    
    if (import.meta.env.DEV) {
      console.warn('Error fetching Ticketmaster event details:', error);
    }
    throw error;
  }
}

/**
 * Get best quality image from Ticketmaster images array
 * Prioritizes 16:9 ratio and largest size
 */
function getBestImage(images: Array<{ratio: string; url: string; width: number; height: number; fallback: boolean}> | undefined): string | null {
  if (!images || images.length === 0) return null;
  
  // Filter out fallback images
  const validImages = images.filter(img => !img.fallback);
  if (validImages.length === 0) return null;
  
  // Prefer 16:9 ratio images, sorted by size (largest first)
  const ratio16_9 = validImages
    .filter(img => img.ratio === '16_9')
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));
  
  if (ratio16_9.length > 0) {
    return ratio16_9[0].url;
  }
  
  // Fallback to largest available image
  const sortedBySize = validImages.sort((a, b) => (b.width * b.height) - (a.width * a.height));
  return sortedBySize[0].url;
}

/**
 * Convert Ticketmaster event to Inner City Event format
 */
export function convertTicketmasterEventToInnerCity(
  tmEvent: TicketmasterEvent,
  cityId: string,
  organizerId: string = 'ticketmaster'
): any {
  const venue = tmEvent._embedded?.venues?.[0];
  const classification = tmEvent.classifications?.[0];
  
  // Get primary image - prefer largest 16:9 image, then largest available
  const imageUrl = getBestImage(tmEvent.images) || 'https://picsum.photos/800/600';

  const startDate = tmEvent.dates.start.dateTime || 
                   `${tmEvent.dates.start.localDate}T${tmEvent.dates.start.localTime || '20:00:00'}`;
  
  // Estimate end time (add 4 hours if not specified)
  const start = new Date(startDate);
  const end = new Date(start);
  end.setHours(end.getHours() + 4);

  // Get all images sorted by size (largest first) for better quality
  const allImages = tmEvent.images
    ?.filter(img => !img.fallback)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height))
    .map(img => img.url) || [imageUrl];

  // Build full address
  const fullAddress = [
    venue?.address?.line1,
    venue?.address?.line2,
    venue?.city?.name,
    venue?.state?.name,
    venue?.postalCode,
    venue?.country?.name
  ].filter(Boolean).join(', ');

  // Build rich description with all available information
  const buildLongDesc = () => {
    const parts: string[] = [];
    
    // Event name and type
    parts.push(tmEvent.name);
    
    // Add attractions/performers
    const attractions = tmEvent._embedded?.attractions || [];
    if (attractions.length > 0) {
      const attractionNames = attractions.map(a => a.name).join(', ');
      if (attractions.length === 1) {
        parts.push(`featuring ${attractionNames}`);
      } else {
        parts.push(`featuring ${attractionNames}`);
      }
    }
    
    // Add venue
    if (venue?.name) {
      parts.push(`at ${venue.name}`);
    }
    
    // Add genre/subgenre details
    const genreInfo: string[] = [];
    if (classification?.segment?.name) {
      genreInfo.push(classification.segment.name);
    }
    if (classification?.genre?.name && classification.genre.name !== classification?.segment?.name) {
      genreInfo.push(classification.genre.name);
    }
    if (classification?.subGenre?.name) {
      genreInfo.push(classification.subGenre.name);
    }
    if (genreInfo.length > 0) {
      parts.push(`• ${genreInfo.join(' / ')}`);
    }
    
    // Add date/time info
    const eventDate = new Date(startDate);
    const dateStr = eventDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const timeStr = tmEvent.dates.start.localTime 
      ? new Date(`${tmEvent.dates.start.localDate}T${tmEvent.dates.start.localTime}`).toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        })
      : null;
    
    if (timeStr) {
      parts.push(`• ${dateStr} at ${timeStr}`);
    } else {
      parts.push(`• ${dateStr}`);
    }
    
    // Add price range if available
    if (tmEvent.priceRanges && tmEvent.priceRanges.length > 0) {
      const priceRange = tmEvent.priceRanges[0];
      const minPrice = priceRange.min.toFixed(2);
      const maxPrice = priceRange.max.toFixed(2);
      const currency = priceRange.currency || 'USD';
      const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency;
      
      if (minPrice === maxPrice) {
        parts.push(`• Tickets from ${currencySymbol}${minPrice}`);
      } else {
        parts.push(`• Tickets ${currencySymbol}${minPrice} - ${currencySymbol}${maxPrice}`);
      }
    }
    
    // Add age restrictions
    if (tmEvent.ageRestrictions?.legalAgeEnforced) {
      parts.push(`• Age restrictions may apply`);
    }
    
    // Add promoter info
    const promoter = tmEvent.promoter || tmEvent.promoters?.[0];
    if (promoter?.name) {
      parts.push(`• Presented by ${promoter.name}`);
    }
    
    // Add venue location context
    if (venue?.city?.name && venue?.state?.name) {
      parts.push(`• Located in ${venue.city.name}, ${venue.state.name}`);
    } else if (venue?.city?.name) {
      parts.push(`• Located in ${venue.city.name}`);
    }
    
    return parts.join(' ');
  };

  return {
    id: `tm_${tmEvent.id}`,
    cityId,
    organizerId,
    tier: 'official' as const,
    title: tmEvent.name,
    shortDesc: classification?.segment?.name || classification?.genre?.name || 'Live Event',
    longDesc: buildLongDesc(),
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    venueName: venue?.name || 'Venue TBA',
    address: fullAddress || venue?.address?.line1 || venue?.city?.name || '',
    lat: venue?.location?.latitude ? parseFloat(venue.location.latitude) : 0,
    lng: venue?.location?.longitude ? parseFloat(venue.location.longitude) : 0,
    categories: [classification?.segment?.name || 'Music'],
    subcategories: [classification?.genre?.name || classification?.subGenre?.name || 'Live'],
    mediaUrls: allImages.length > 0 ? allImages : [imageUrl],
    ticketUrl: tmEvent.url,
    ticketmasterId: tmEvent.id,
    status: 'active' as const,
    counts: {
      likes: 0,
      saves: 0,
      comments: 0,
      rsvpGoing: 0,
      rsvpInterested: 0,
    },
    // Additional Ticketmaster fields
    priceRanges: tmEvent.priceRanges?.map(pr => ({
      type: pr.type,
      currency: pr.currency,
      min: pr.min,
      max: pr.max,
    })),
    ageRestrictions: tmEvent.ageRestrictions ? {
      legalAgeEnforced: tmEvent.ageRestrictions.legalAgeEnforced,
    } : undefined,
    ticketLimit: tmEvent.ticketLimit ? {
      info: tmEvent.ticketLimit.info,
    } : undefined,
    promoter: tmEvent.promoter || tmEvent.promoters?.[0] ? {
      id: tmEvent.promoter?.id || tmEvent.promoters?.[0]?.id || '',
      name: tmEvent.promoter?.name || tmEvent.promoters?.[0]?.name || '',
    } : undefined,
    venueDetails: venue ? {
      boxOfficeInfo: venue.boxOfficeInfo?.phoneNumberDetail || venue.boxOfficeInfo?.openHoursDetail,
      parkingDetail: venue.parkingDetail,
      accessibleSeatingDetail: venue.accessibleSeatingDetail,
      generalInfo: venue.generalInfo?.generalRule,
      childRule: venue.generalInfo?.childRule,
      phoneNumber: venue.boxOfficeInfo?.phoneNumberDetail,
      openHours: venue.boxOfficeInfo?.openHoursDetail,
      acceptedPayment: venue.boxOfficeInfo?.acceptedPaymentDetail,
      willCall: venue.boxOfficeInfo?.willCallDetail,
    } : undefined,
    sales: tmEvent.sales ? {
      publicStart: tmEvent.sales.public.startDateTime,
      publicEnd: tmEvent.sales.public.endDateTime,
    } : undefined,
    timezone: tmEvent.dates.timezone || venue?.timezone,
    locale: tmEvent.locale,
  };
}

/**
 * Get country code from city name (basic mapping)
 */
export function getCountryCodeForCity(cityName: string): string {
  // Map city names to country codes
  const cityCountryMap: Record<string, string> = {
    'Berlin': 'DE',
    'London': 'GB',
    'New York': 'US',
    'NYC': 'US',
    'Tokyo': 'JP',
    'Paris': 'FR',
    'Amsterdam': 'NL',
    'Barcelona': 'ES',
    'Los Angeles': 'US',
    'LA': 'US',
    'Chicago': 'US',
    'Miami': 'US',
    'San Francisco': 'US',
    'Seattle': 'US',
    'Vancouver': 'CA',
    'Calgary': 'CA',
  };

  return cityCountryMap[cityName] || 'US';
}
