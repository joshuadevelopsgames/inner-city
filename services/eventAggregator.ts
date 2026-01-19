/**
 * Event Aggregator Service
 * Combines events from multiple sources: Ticketmaster, Eventbrite, and more
 */

import { searchEventsByCity as searchTicketmasterEvents, convertTicketmasterEventToInnerCity, getCountryCodeForCity } from './ticketmaster';
import { searchEventsByCity as searchEventbriteEvents, convertEventbriteEventToInnerCity } from './eventbrite';
import { fetchUserEvents } from './events';

// Helper to check if Eventbrite token exists (for logging)
function hasEventbriteToken(): boolean {
  const token = (import.meta as any).env?.VITE_EVENTBRITE_API_TOKEN || 
         (typeof process !== 'undefined' && process.env?.VITE_EVENTBRITE_API_TOKEN) ||
         null;
  return !!token;
}
import { Event } from '../types';

export interface AggregatorOptions {
  cityName: string;
  cityId: string;
  categories?: string[]; // e.g., ['music', 'sports', 'arts']
  startDate?: Date;
  endDate?: Date;
  limit?: number; // Max events per source
  includeTicketmaster?: boolean;
  includeEventbrite?: boolean;
  includeUserEvents?: boolean; // Include user-generated events from database
}

export interface AggregatorResult {
  events: Event[];
  sources: {
    ticketmaster: number;
    eventbrite: number;
    user: number;
    total: number;
  };
}

/**
 * Aggregate events from multiple sources
 */
export async function aggregateCityEvents(
  options: AggregatorOptions
): Promise<AggregatorResult> {
  const {
    cityName,
    cityId,
    categories = ['music'],
    startDate,
    endDate,
    limit = 50,
    includeTicketmaster = true,
    includeEventbrite = true,
    includeUserEvents = true,
  } = options;

  const allEvents: Event[] = [];
  const sourceCounts = {
    ticketmaster: 0,
    eventbrite: 0,
    user: 0,
    total: 0,
  };

  // Fetch from all sources in parallel for better performance
  const fetchPromises: Promise<void>[] = [];

  // Fetch from Ticketmaster (all categories in parallel)
  if (includeTicketmaster) {
    try {
      const countryCode = getCountryCodeForCity(cityName);
      
      // Fetch all categories in parallel instead of sequentially
      const ticketmasterPromises = categories.map(async (category) => {
        try {
          const response = await searchTicketmasterEvents(cityName, countryCode, {
            classificationName: category,
            startDateTime: startDate?.toISOString(),
            endDateTime: endDate?.toISOString(),
            size: Math.min(Math.ceil(limit / categories.length), 50), // Distribute limit across categories
          });

          if (response._embedded?.events) {
            const tmEvents = response._embedded.events
              .slice(0, Math.ceil(limit / categories.length))
              .map(tmEvent => convertTicketmasterEventToInnerCity(tmEvent, cityId, 'ticketmaster'));
            
            allEvents.push(...tmEvents);
            sourceCounts.ticketmaster += tmEvents.length;
          }
        } catch (error) {
          // Silently continue - errors are already handled in searchTicketmasterEvents
          // Only log in development
          if (import.meta.env.DEV) {
            console.warn(`Failed to fetch ${category} events from Ticketmaster:`, error);
          }
        }
      });

      fetchPromises.push(...ticketmasterPromises);
    } catch (error) {
      // Only log in development
      if (import.meta.env.DEV) {
        console.warn('Ticketmaster aggregation error:', error);
      }
    }
  }

  // Fetch from Eventbrite (in parallel with Ticketmaster)
  if (includeEventbrite) {
    const eventbritePromise = (async () => {
      try {
        if (import.meta.env.DEV) {
          console.log(`Eventbrite: Fetching events for ${cityName}...`);
        }
        const ebEvents = await searchEventbriteEvents(cityName, {
          status: 'live',
          page_size: limit,
        });

        // searchEventbriteEvents now returns empty array on error, so check if we got events
        if (ebEvents && ebEvents.length > 0) {
          const convertedEvents = ebEvents
            .slice(0, limit)
            .map(ebEvent => convertEventbriteEventToInnerCity(ebEvent, cityId, 'eventbrite'));

          allEvents.push(...convertedEvents);
          sourceCounts.eventbrite += convertedEvents.length;
          if (import.meta.env.DEV) {
            console.log(`Eventbrite: Found ${ebEvents.length} events, converted ${convertedEvents.length} for ${cityName}`);
          }
        } else {
          if (import.meta.env.DEV) {
            const hasToken = hasEventbriteToken();
            console.warn(`Eventbrite: No events returned for ${cityName} (token: ${hasToken ? 'present' : 'missing'})`);
          }
        }
        // Silently continue if no events (token might be invalid or not configured)
      } catch (error) {
        // Only log in development
        if (import.meta.env.DEV) {
          console.warn('Eventbrite aggregation error:', error);
        }
        // Eventbrite might not be configured, that's okay
      }
    })();

    fetchPromises.push(eventbritePromise);
  }

  // Fetch user-generated events from database (in parallel with API calls)
  if (includeUserEvents) {
    const userEventsPromise = (async () => {
      try {
        if (import.meta.env.DEV) {
          console.log(`User Events: Fetching events for ${cityName}...`);
        }
        const userEvents = await fetchUserEvents(cityId, {
          limit: limit * 2, // Get more user events since they're local
          startDate: startDate || new Date(),
          endDate: endDate,
          categories: categories,
        });

        if (userEvents && userEvents.length > 0) {
          allEvents.push(...userEvents);
          sourceCounts.user += userEvents.length;
          if (import.meta.env.DEV) {
            console.log(`User Events: Found ${userEvents.length} events for ${cityName}`);
          }
        }
      } catch (error) {
        // Only log in development
        if (import.meta.env.DEV) {
          console.warn('User events aggregation error:', error);
        }
      }
    })();

    fetchPromises.push(userEventsPromise);
  }

  // Wait for all fetches to complete in parallel
  await Promise.all(fetchPromises);

  // Deduplicate events by title, date, and venue
  const deduplicated = deduplicateEvents(allEvents);
  sourceCounts.total = deduplicated.length;

  return {
    events: deduplicated,
    sources: sourceCounts,
  };
}

/**
 * Deduplicate events based on title, date, and venue
 */
function deduplicateEvents(events: Event[]): Event[] {
  const seen = new Map<string, Event>();

  for (const event of events) {
    // Create a unique key from title, date, and venue
    const key = `${event.title.toLowerCase()}_${event.startAt}_${event.venueName.toLowerCase()}`;
    
    if (!seen.has(key)) {
      seen.set(key, event);
    } else {
      // If duplicate found, prefer the one with more complete data
      const existing = seen.get(key)!;
      if ((event.mediaUrls?.length || 0) > (existing.mediaUrls?.length || 0) ||
          event.lat !== 0 || event.lng !== 0) {
        seen.set(key, event);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Filter events by category keywords
 */
export function filterEventsByCategory(
  events: Event[],
  categoryKeywords: string[]
): Event[] {
  if (categoryKeywords.length === 0) return events;

  return events.filter(event => {
    const searchText = `${event.title} ${event.shortDesc} ${event.categories?.join(' ')} ${event.subcategories?.join(' ')}`.toLowerCase();
    return categoryKeywords.some(keyword => 
      searchText.includes(keyword.toLowerCase())
    );
  });
}

/**
 * Sort events by date (upcoming first)
 */
export function sortEventsByDate(events: Event[]): Event[] {
  return [...events].sort((a, b) => {
    const dateA = new Date(a.startAt).getTime();
    const dateB = new Date(b.startAt).getTime();
    return dateA - dateB;
  });
}

/**
 * Filter events to only show upcoming ones
 */
export function filterUpcomingEvents(events: Event[]): Event[] {
  const now = new Date();
  return events.filter(event => {
    const eventDate = new Date(event.startAt);
    return eventDate >= now;
  });
}
