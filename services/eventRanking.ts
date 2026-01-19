/**
 * Event Ranking and Interest-Based Filtering Service
 * 
 * This service ranks events based on user interests, prioritizing relevant events
 * while keeping less relevant ones as "background noise" (still visible but lower priority)
 */

import { Event } from '../types';
import { User } from '../types';

export interface EventRanking {
  event: Event;
  score: number;
  priority: 'high' | 'medium' | 'low';
  reasons: string[]; // Why this event was ranked this way
}

export interface RankedEvents {
  priority: Event[]; // High-interest events (front and center)
  background: Event[]; // Lower-interest events (background noise)
  all: Event[]; // All events sorted by score
}

/**
 * Calculate relevance score for an event based on user interests
 */
export function calculateEventScore(event: Event, user: User | null): number {
  if (!user || !user.interests || user.interests.length === 0) {
    // If no user interests, return neutral score
    return 0.5;
  }

  let score = 0;
  const reasons: string[] = [];

  // Normalize event text for matching
  const eventText = `${event.title} ${event.shortDesc} ${event.longDesc} ${event.categories?.join(' ')} ${event.subcategories?.join(' ')}`.toLowerCase();
  const eventKeywords = new Set([
    ...event.categories?.map(c => c.toLowerCase()) || [],
    ...event.subcategories?.map(c => c.toLowerCase()) || [],
    ...eventText.split(/\s+/).filter(w => w.length > 3),
  ]);

  // Check each user interest
  user.interests.forEach(interest => {
    const interestLower = interest.toLowerCase();
    
    // Exact category match (high weight)
    if (event.categories?.some(cat => cat.toLowerCase().includes(interestLower))) {
      score += 10;
      reasons.push(`Category matches "${interest}"`);
    }
    
    // Subcategory match (medium weight)
    if (event.subcategories?.some(sub => sub.toLowerCase().includes(interestLower))) {
      score += 7;
      reasons.push(`Subcategory matches "${interest}"`);
    }
    
    // Keyword match in title/description (medium weight)
    if (event.title.toLowerCase().includes(interestLower)) {
      score += 8;
      reasons.push(`Title contains "${interest}"`);
    }
    
    // Keyword match in description (lower weight)
    if (event.shortDesc.toLowerCase().includes(interestLower) || 
        event.longDesc.toLowerCase().includes(interestLower)) {
      score += 5;
      reasons.push(`Description mentions "${interest}"`);
    }
    
    // Venue name match (lower weight, but still relevant)
    if (event.venueName.toLowerCase().includes(interestLower)) {
      score += 3;
      reasons.push(`Venue matches "${interest}"`);
    }
  });

  // Boost score for official/verified events
  if (event.tier === 'official') {
    score += 5;
    reasons.push('Official/verified event');
  }

  // Boost score for events with good engagement
  // Include rsvpInterested (saves) in engagement calculation for popularity ranking
  const totalEngagement = (event.counts.likes || 0) + 
                         (event.counts.saves || 0) + 
                         (event.counts.rsvpGoing || 0) +
                         (event.counts.rsvpInterested || 0);
  if (totalEngagement > 50) {
    score += 3;
    reasons.push('High engagement');
  } else if (totalEngagement > 20) {
    score += 1;
    reasons.push('Moderate engagement');
  }
  
  // Extra boost for events with many saves/interested (popularity signal)
  const savesAndInterested = (event.counts.saves || 0) + (event.counts.rsvpInterested || 0);
  if (savesAndInterested > 30) {
    score += 2;
    reasons.push('Highly saved/interested');
  } else if (savesAndInterested > 10) {
    score += 1;
    reasons.push('Popular event');
  }

  // Boost score for events happening soon (within 7 days)
  const daysUntilEvent = Math.floor(
    (new Date(event.startAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (daysUntilEvent >= 0 && daysUntilEvent <= 7) {
    score += 4;
    reasons.push('Happening soon');
  } else if (daysUntilEvent > 7 && daysUntilEvent <= 14) {
    score += 2;
    reasons.push('Happening this week');
  }

  // Boost score for events with images
  if (event.mediaUrls && event.mediaUrls.length > 0) {
    score += 2;
    reasons.push('Has media');
  }

  // Boost score for events with location data
  if (event.lat !== 0 && event.lng !== 0) {
    score += 1;
    reasons.push('Has location');
  }

  // Penalize events that are too far in the future (> 3 months)
  if (daysUntilEvent > 90) {
    score -= 5;
    reasons.push('Too far in future');
  }

  return Math.max(0, score); // Ensure non-negative score
}

/**
 * Rank events based on user interests
 */
export function rankEventsByInterest(
  events: Event[],
  user: User | null
): RankedEvents {
  const ranked: EventRanking[] = events.map(event => {
    const score = calculateEventScore(event, user);
    
    // Determine priority level
    let priority: 'high' | 'medium' | 'low';
    if (score >= 15) {
      priority = 'high';
    } else if (score >= 8) {
      priority = 'medium';
    } else {
      priority = 'low';
    }

    return {
      event,
      score,
      priority,
      reasons: [], // Could populate this if needed for debugging
    };
  });

  // Sort by score (highest first)
  ranked.sort((a, b) => b.score - a.score);

  // Separate into priority and background
  const priorityEvents = ranked
    .filter(r => r.priority === 'high' || r.priority === 'medium')
    .map(r => r.event);

  const backgroundEvents = ranked
    .filter(r => r.priority === 'low')
    .map(r => r.event);

  return {
    priority: priorityEvents,
    background: backgroundEvents,
    all: ranked.map(r => r.event),
  };
}

/**
 * Get interest keywords from user
 */
export function getUserInterestKeywords(user: User | null): string[] {
  if (!user || !user.interests) return [];
  
  // Expand interests with related keywords
  const expanded: string[] = [];
  
  user.interests.forEach(interest => {
    expanded.push(interest.toLowerCase());
    
    // Add common variations
    const variations: Record<string, string[]> = {
      'techno': ['electronic', 'edm', 'rave', 'warehouse', 'underground'],
      'house': ['deep house', 'tech house', 'electronic'],
      'hip hop': ['rap', 'urban', 'r&b'],
      'rock': ['alternative', 'indie', 'punk'],
      'jazz': ['blues', 'soul'],
      'sports': ['game', 'match', 'tournament'],
      'comedy': ['standup', 'improv'],
      'theater': ['drama', 'play', 'musical'],
    };
    
    const lowerInterest = interest.toLowerCase();
    if (variations[lowerInterest]) {
      expanded.push(...variations[lowerInterest]);
    }
  });
  
  return [...new Set(expanded)]; // Remove duplicates
}

/**
 * Filter events by interest keywords (fuzzy matching)
 */
export function filterEventsByInterests(
  events: Event[],
  user: User | null
): Event[] {
  if (!user || !user.interests || user.interests.length === 0) {
    return events; // Return all if no interests
  }

  const keywords = getUserInterestKeywords(user);
  const matchedEvents: Event[] = [];
  const unmatchedEvents: Event[] = [];

  events.forEach(event => {
    const eventText = `${event.title} ${event.shortDesc} ${event.categories?.join(' ')} ${event.subcategories?.join(' ')}`.toLowerCase();
    
    const hasMatch = keywords.some(keyword => 
      eventText.includes(keyword.toLowerCase())
    );

    if (hasMatch) {
      matchedEvents.push(event);
    } else {
      unmatchedEvents.push(event);
    }
  });

  // Return matched events first, then unmatched
  return [...matchedEvents, ...unmatchedEvents];
}

/**
 * Smart event ranking that combines interest matching with other factors
 */
export function smartRankEvents(
  events: Event[],
  user: User | null
): RankedEvents {
  // First, rank by interest score
  const ranked = rankEventsByInterest(events, user);
  
  // Within each priority group, sort by date (soonest first)
  const sortByDate = (a: Event, b: Event) => {
    return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
  };
  
  ranked.priority.sort(sortByDate);
  ranked.background.sort(sortByDate);
  ranked.all.sort(sortByDate);
  
  return ranked;
}
