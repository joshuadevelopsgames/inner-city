# Inner City - Project Overview

## 🎯 Project Description

**Inner City** is a social event discovery platform focused on underground music, warehouse raves, and exclusive events. The app helps users discover events in their city, connect with like-minded people, and build a community around nightlife and music culture.

### Core Concept
- **Event Discovery**: Aggregates events from Ticketmaster, Eventbrite, and user-generated content
- **Social-First**: Built-in social features for connecting with other event-goers
- **City-Based**: Location-aware event discovery with city switching
- **Community-Driven**: Users can create events, follow organizers, and build their social network

---

## 🛠️ Tech Stack

### Frontend
- **React 19** with TypeScript
- **Vite** for build tooling
- **React Router DOM** for routing
- **Tailwind CSS v4** for styling
- **Framer Motion** for animations and gestures
- **Lucide React** for icons
- **Mapbox GL JS** for interactive maps
- **date-fns** for date formatting

### Backend & Infrastructure
- **Supabase** (PostgreSQL database, Auth, Storage, Edge Functions)
- **Vercel** for frontend deployment
- **Supabase Edge Functions** for API proxying (Ticketmaster, Eventbrite)

### Key Libraries
- `@supabase/supabase-js` - Supabase client
- `mapbox-gl` - Map rendering
- `framer-motion` - Animations and drag gestures

---

## ✨ Key Features

### 1. Event Discovery
- **Multi-Source Aggregation**: Combines events from:
  - Ticketmaster Discovery API
  - Eventbrite API
  - User-generated events
- **Smart Ranking**: Events ranked by user interests and engagement
- **Event Types**: Filter by concerts, comedy, user events, nightlife, art/culture, sports, food/drink, workshops, raves
- **Map View**: Interactive map with dynamic clustering, time-based color coding
- **Event Details**: Comprehensive event pages with pricing, venue info, RSVP options

### 2. Social Features
- **Follow System**: Follow/unfollow users, view followers and following lists
- **User Posts**: Create posts about events or general content, appears in feed
- **Event RSVP**: Mark events as "Going" or "Interested" (saves event)
- **Direct Messages**: Private messaging between users
- **Friend Discovery**: Three methods:
  - Mutual Interests
  - Same Events (users going to same events)
  - Friends of Friends
- **Event Check-ins**: Check in to live events you're attending
- **Going Together**: See who else is attending events

### 3. User Profiles
- **Photo-First Design**: Dating-app style profile with swipeable photo carousel
- **Profile Photos**: Upload up to 6 photos from camera roll
- **Photo Management**: Long-press to delete photos
- **Circular Avatars**: All profile photos are circular
- **Profile Customization**: Bio, interests, social links, home city, travel cities
- **Verified Badges**: Support for verified users
- **Follower/Following Counts**: Real-time counts with database triggers

### 4. Organizations
- **Event Curators**: Users can create organizations (e.g., "What's The Move Vancouver")
- **Organization Pages**: Dedicated pages with logo, cover image, description
- **Membership**: Organization members can create events for the organization
- **Following**: Users can follow organizations to see their events
- **Event Hosting**: Organizations can host multiple events

### 5. User-Generated Events
- **Event Creation**: Multi-step form to create events
- **Media Upload**: Upload event images
- **Event Details**: Title, description, date/time, venue, address, categories
- **Geocoding**: Automatic address geocoding for map display
- **Tier System**: Community, official, or underground tiers

### 6. Collections (Previously "The Vault")
- **Interested Events**: Events where user clicked "Interested"
- **Saved Events**: Manually saved events
- **Two Tabs**: Separate sections for interested vs saved

### 7. Map Features
- **Dynamic Clustering**: Events group together when zoomed out, split when zoomed in
- **Time-Based Colors**: Events color-coded by time (red for today, gradient for future)
- **Interactive Pins**: Click pins to view event details
- **Location Services**: Auto-detect user's city
- **Theme-Aware**: Map style switches between light/dark based on app theme

### 8. UI/UX Features
- **Pull-to-Refresh**: Scroll to top to refresh feed
- **Loading States**: Loading indicators throughout app
- **Responsive Design**: Works on mobile and desktop
- **PWA Support**: Installable as Progressive Web App
- **Theme System**: Multiple dark/light themes
- **Swipe Gestures**: Swipeable photo carousels, navigation gestures

---

## 🗄️ Database Schema

### Core Tables

#### `profiles`
- User profile data (extends Supabase auth.users)
- Fields: `id`, `username`, `display_name`, `avatar_url`, `profile_photos` (TEXT[]), `bio`, `interests` (TEXT[]), `home_city`, `travel_cities`, `follower_count`, `following_count`, `verified`, `created_at`

#### `cities`
- Supported cities
- Fields: `id`, `name`, `country`, `coordinates` (JSONB), `created_at`

#### `events`
- Events from all sources
- Fields: `id`, `source` (ticketmaster/eventbrite/user), `city_id`, `organizer_id`, `organization_id`, `tier`, `title`, `short_desc`, `long_desc`, `start_at`, `end_at`, `venue_name`, `address`, `lat`, `lng`, `categories` (TEXT[]), `subcategories` (TEXT[]), `media_urls` (TEXT[]), `ticket_url`, `status`, `counts` (JSONB), `created_at`

#### `follows`
- User follow relationships
- Fields: `follower_id`, `following_id`, `created_at`
- Triggers: Auto-update `follower_count` and `following_count` in profiles

#### `event_attendees`
- RSVP data
- Fields: `event_id`, `user_id`, `status` (going/interested/maybe), `is_public`, `checked_in_at`, `created_at`
- Triggers: Auto-update `rsvpGoing` and `rsvpInterested` counts in events.counts

#### `user_posts`
- Social feed posts
- Fields: `id`, `user_id`, `event_id`, `content`, `media_urls` (TEXT[]), `likes_count`, `comments_count`, `created_at`

#### `post_likes` & `post_comments`
- Post engagement
- Triggers: Auto-update counts in user_posts

#### `direct_messages`
- Private messages
- Fields: `id`, `sender_id`, `recipient_id`, `message`, `read_at`, `created_at`

#### `organizations`
- Event curator organizations
- Fields: `id`, `name`, `slug`, `description`, `city_id`, `logo_url`, `cover_image_url`, `website_url`, `instagram_handle`, `twitter_handle`, `created_by`, `verified`, `event_count`, `follower_count`, `created_at`

#### `organization_members` & `organization_followers`
- Organization membership and following

### Storage Buckets
- `profile-photos`: Public bucket for user profile photos (5MB limit, image types only)

---

## 🔌 API Integrations

### Ticketmaster Discovery API
- **Edge Function**: `ticketmaster-proxy` (deployed with `--no-verify-jwt` for anonymous access)
- **Features**: Fetches events by city and category
- **Data**: Comprehensive event details including pricing, venue info, promoter info

### Eventbrite API
- **Edge Function**: `eventbrite-proxy` (deployed with `--no-verify-jwt` for anonymous access)
- **Limitations**: API token only grants access to organizations owned by token holder
- **Current Status**: Limited event coverage due to API restrictions

### Mapbox
- **Geocoding API**: Reverse geocoding for city detection, address geocoding
- **Map Rendering**: Interactive maps with clustering

---

## 📁 Project Structure

```
inner-city/
├── components/           # Reusable UI components
│   ├── UI.tsx           # NeonButton, Badge, Card, Input
│   ├── Layout.tsx       # Header, navigation, routing
│   └── CitySearchModal.tsx
│
├── screens/              # Main screen components
│   ├── Feed.tsx         # Main feed with events and posts
│   ├── MapScreen.tsx    # Interactive map view
│   ├── EventDetail.tsx  # Event detail page
│   ├── Profile.tsx      # User profiles (photo-first design)
│   ├── Create.tsx       # User event creation
│   ├── Saved.tsx        # Collections (Interested/Saved events)
│   ├── Messages.tsx     # Direct messages
│   ├── FriendDiscovery.tsx  # Friend discovery
│   ├── Organizations.tsx    # Organization listing
│   ├── OrganizationDetail.tsx
│   ├── Settings.tsx
│   ├── Wallet.tsx       # User tickets
│   └── ...
│
├── services/            # API and business logic
│   ├── ticketmaster.ts  # Ticketmaster API integration
│   ├── eventbrite.ts    # Eventbrite API integration
│   ├── eventAggregator.ts  # Combines events from all sources
│   ├── eventRanking.ts  # Smart event ranking algorithm
│   ├── events.ts        # User event CRUD operations
│   ├── social.ts        # Social features (follows, posts, messages)
│   ├── organizations.ts # Organization management
│   └── geocoding.ts     # Mapbox geocoding
│
├── lib/
│   └── supabase.ts      # Supabase client configuration
│
├── utils/
│   └── imageOptimization.ts  # Image URL optimization
│
├── supabase/
│   ├── functions/       # Edge Functions
│   │   ├── ticketmaster-proxy/
│   │   ├── eventbrite-proxy/
│   │   └── ...
│   └── migrations/     # Database migrations (24 migrations)
│       ├── 001_initial_schema.sql
│       ├── 015_social_features.sql
│       ├── 017_update_rsvp_interested_count.sql
│       ├── 018_profile_photos.sql
│       ├── 019_create_profile_photos_storage.sql
│       ├── 020_organizations_and_checkins.sql
│       ├── 021_add_follower_counts.sql
│       └── ...
│
├── scripts/            # Utility scripts
│   ├── create-vancouver-mock-data.mjs  # Generate mock data
│   ├── create-test-profile.mjs
│   └── ...
│
├── store.tsx           # React Context for global state
├── types.ts            # TypeScript type definitions
├── theme.ts            # Theme definitions
└── App.tsx             # Main app component with routing
```

---

## 🔄 State Management

### React Context (`store.tsx`)
Global state includes:
- `user`: Current authenticated user
- `activeCity`: Currently selected city
- `activeEventType`: Current event type filter
- `events`: All events (from all cities)
- `rankedEvents`: Smart-ranked events for active city
- `tickets`: User's tickets
- `savedEventIds`: Saved event IDs
- `theme`: Current theme
- `notifications`: User notifications

### Key Functions
- `fetchCityEvents()`: Aggregates events from Ticketmaster, Eventbrite, and database
- `refreshFeed()`: Pull-to-refresh functionality
- `updateEventInStore()`: Update event data after RSVP
- `smartRankEvents()`: Rank events by user interests

---

## 🎨 UI/UX Design

### Design Philosophy
- **Dark-First**: Primarily dark themes with light mode support
- **Neon Aesthetic**: Accent colors with glow effects
- **Photo-First Profiles**: Dating-app style profile layout
- **Mobile-Optimized**: Designed for mobile, responsive for desktop

### Theme System
- Multiple theme options (dark-neutral, dark-vibrant, etc.)
- Theme persists to localStorage
- Dynamic theme switching
- Map style adapts to theme (light/dark Mapbox styles)

### Key UI Patterns
- **Cards**: Rounded cards with borders and backdrop blur
- **Badges**: Event category badges, status badges
- **Neon Buttons**: Accent-colored buttons with glow
- **Swipe Gestures**: Photo carousels, navigation
- **Loading States**: Spinners and skeleton screens
- **Empty States**: Helpful messages when no data

---

## 🚀 Deployment

### Frontend (Vercel)
- Auto-deploys from GitHub `main` branch
- Environment variables set in Vercel dashboard
- PWA configured with manifest.json

### Backend (Supabase)
- Database migrations applied via SQL Editor or CLI
- Edge Functions deployed via Supabase CLI:
  ```bash
  supabase functions deploy ticketmaster-proxy --no-verify-jwt
  supabase functions deploy eventbrite-proxy --no-verify-jwt
  ```
- Storage buckets configured via migrations

---

## 📊 Current Status

### ✅ Completed Features
- Event discovery from Ticketmaster, Eventbrite, and user-generated
- Social features (follows, posts, messages, RSVP)
- User profiles with photo uploads
- Organizations system
- Friend discovery
- Event check-ins
- Map with clustering
- Collections (Interested/Saved events)
- Pull-to-refresh
- PWA support
- Multiple themes

### 🔧 Recent Work
- Added follower/following count triggers
- Fixed event count updates after RSVP
- Added organizer profile links on events
- Fixed Messages screen system pulse error
- Created mock data generation script (100 users, 150+ events for Vancouver)
- Integrated user-generated events into feed and map

### 📝 Pending/In Progress
- Eventbrite API has limitations (only shows events from token owner's organizations)
- Need to apply migration `021_add_follower_counts.sql` to database
- Some features may need additional testing

---

## 🔐 Environment Variables

### Required
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Optional
```env
VITE_TICKETMASTER_API_KEY=your-ticketmaster-key
VITE_MAPBOX_ACCESS_TOKEN=your-mapbox-token
VITE_EVENTBRITE_API_TOKEN=your-eventbrite-token
```

### Supabase Edge Function Secrets
Set in Supabase Dashboard → Edge Functions → Settings:
- `TICKETMASTER_API_KEY`
- `EVENTBRITE_API_TOKEN`

---

## 🧪 Development Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Create mock data
node scripts/create-vancouver-mock-data.mjs

# Create test profile
node scripts/create-test-profile.mjs
```

---

## 📚 Key Documentation Files

- `README.md` - Basic project overview
- `ARCHITECTURE.md` - System architecture details
- `SOCIAL_FEATURES.md` - Social features documentation
- `SUPABASE_SETUP.md` - Supabase setup guide
- `TICKETMASTER_SETUP.md` - Ticketmaster API setup
- `EVENTBRITE_SETUP.md` - Eventbrite API setup

---

## 🎯 Key Design Decisions

1. **Supabase as Backend**: Chosen for rapid development, built-in auth, real-time capabilities
2. **Edge Functions for API Proxying**: Solves CORS issues and keeps API keys secure
3. **React Context for State**: Simple state management without Redux
4. **Photo-First Profiles**: Inspired by dating apps for better user engagement
5. **Multi-Source Event Aggregation**: Combines external APIs with user-generated content
6. **Database Triggers for Counts**: Automatic count updates (followers, RSVPs) via PostgreSQL triggers

---

## 🔮 Future Enhancements

- Real-time notifications
- Group event creation
- Event reviews and ratings
- Advanced search and filtering
- Push notifications
- Offline support
- Analytics and insights
- Payment integration (Stripe setup exists but not fully integrated)

---

## 📞 Support & Setup

For detailed setup instructions, see:
- `SUPABASE_SETUP.md` - Complete Supabase setup
- `QUICK_SETUP.md` - Quick start guide
- `AUTO_SETUP_INSTRUCTIONS.md` - Automated setup

---

**Last Updated**: January 2025
**Version**: 0.0.0 (Development)
**Status**: Active Development
