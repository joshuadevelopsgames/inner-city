
export type Tier = 'community' | 'official';
export type ContentStatus = 'active' | 'under_review' | 'removed';
export type TicketStatus = 'active' | 'used' | 'expired';
export type TicketSource = 'native' | 'ticketmaster';
export type EventType = 'all' | 'concerts' | 'comedy' | 'user-events' | 'nightlife' | 'art-culture' | 'sports' | 'food-drink' | 'workshops' | 'raves';

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  profilePhotos?: string[]; // Array of photo URLs for dating-app style profiles
  bio: string;
  socials: { twitter?: string; instagram?: string };
  interests: string[];
  homeCity: string;
  travelCities: string[];
  profileMode: 'full' | 'minimal';
  organizerTier: 'none' | 'official';
  verified: boolean;
  createdAt: string;
  isTicketmasterConnected?: boolean;
}

export interface City {
  id: string;
  name: string;
  country: string;
  timezone: string;
  lore?: string;
  coordinates?: { lat: number, lng: number };
}

export interface CityPulse {
  id: string;
  cityId: string;
  type: 'neighborhood' | 'trend' | 'history';
  title: string;
  description: string;
  imageUrl: string;
  metric?: string; // e.g., "PEAKING NOW" or "12 NEW EVENTS"
}

export interface Event {
  id: string;
  cityId: string;
  organizerId: string;
  organizationId?: string; // Link to organization (event curator/promoter)
  tier: Tier;
  title: string;
  shortDesc: string;
  longDesc: string;
  startAt: string;
  endAt: string;
  venueName: string;
  address: string;
  lat: number;
  lng: number;
  categories: string[];
  subcategories: string[];
  mediaUrls: string[];
  ticketUrl?: string;
  ticketmasterId?: string; // New field for TM integration
  eventbriteId?: string; // Eventbrite event ID
  status: ContentStatus;
  counts: {
    likes: number;
    saves: number;
    comments: number;
    rsvpGoing: number;
    rsvpInterested: number;
  };
  // Additional Ticketmaster/Eventbrite fields
  priceRanges?: Array<{
    type: string;
    currency: string;
    min: number;
    max: number;
  }>;
  ageRestrictions?: {
    legalAgeEnforced: boolean;
    minAge?: number;
  };
  ticketLimit?: {
    info: string;
  };
  promoter?: {
    id: string;
    name: string;
  };
  venueDetails?: {
    boxOfficeInfo?: string;
    parkingDetail?: string;
    accessibleSeatingDetail?: string;
    generalInfo?: string;
    childRule?: string;
    phoneNumber?: string;
    openHours?: string;
    acceptedPayment?: string;
    willCall?: string;
  };
  sales?: {
    publicStart?: string;
    publicEnd?: string;
  };
  timezone?: string;
  locale?: string;
  onlineEvent?: boolean;
  capacity?: number;
  currency?: string;
}

export interface Ticket {
  id: string;
  eventId: string;
  userId: string;
  qrCode: string;
  status: TicketStatus;
  type: string;
  gate?: string;
  section?: string;
  purchaseDate: string;
  source: TicketSource; // New field
}

export interface ThemeTokens {
  name: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textDim: string;
  border: string;
  accent: string;
  accentSecondary?: string;
  glowIntensity: string;
}

export interface Notification {
  id: string;
  type: 'follow' | 'comment' | 'dm' | 'reminder' | 'like' | 'rsvp';
  fromUserId: string;
  text: string;
  createdAt: string;
  read: boolean;
}

// Social Features
export interface UserPost {
  id: string;
  userId: string;
  eventId?: string;
  content: string;
  mediaUrls: string[];
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  updatedAt: string;
  user?: User;
  event?: Event;
  isLiked?: boolean;
}

export interface PostComment {
  id: string;
  postId: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user?: User;
}

export interface EventAttendee {
  eventId: string;
  userId: string;
  status: 'going' | 'interested' | 'maybe';
  isPublic: boolean;
  createdAt: string;
  checkedInAt?: string; // Timestamp when user checked in to the event
  user?: User;
  event?: Event;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  message: string;
  readAt?: string;
  createdAt: string;
  sender?: User;
  recipient?: User;
}

export interface EventReview {
  id: string;
  eventId: string;
  userId: string;
  rating: number;
  reviewText?: string;
  createdAt: string;
  user?: User;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  cityId?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  websiteUrl?: string;
  instagramHandle?: string;
  twitterHandle?: string;
  createdBy?: string;
  verified: boolean;
  eventCount: number;
  followerCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  organizationId: string;
  userId: string;
  role: 'member' | 'admin' | 'owner';
  joinedAt: string;
  user?: User;
  organization?: Organization;
}
