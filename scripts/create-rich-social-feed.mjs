#!/usr/bin/env node
/**
 * Create Rich Social Feed Data
 * 
 * Creates diverse, realistic social interactions to make the Pulse feed feel alive:
 * - Event check-ins with timestamps
 * - Event RSVPs (going/interested) as activity
 * - Comments on posts
 * - Likes on posts
 * - Friend connections
 * - Photo posts
 * - Event shares
 * - More realistic timing and interactions
 */

import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env.local');

try {
  config({ path: envPath });
} catch (e) {
  console.warn('⚠️  .env.local not found, using environment variables');
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || 
                    process.env.SUPABASE_URL || 
                    'https://gdsblffnkiswaweqokcm.supabase.co';
                    
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                           process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Missing Supabase Service Role Key!');
  console.error('Add SUPABASE_SERVICE_ROLE_KEY to .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Realistic post content that feels social and interactive
const INTERACTIVE_POSTS = [
  "Just checked in! The vibes here are immaculate 🔥",
  "Who else is here? Let's link up!",
  "This event is absolutely insane right now",
  "Found my people! The energy is unmatched",
  "Can't believe I almost missed this. Best decision ever!",
  "Shoutout to the DJ for keeping us moving all night",
  "The crowd here is so welcoming. Love this community!",
  "Just met some amazing people. This is what it's all about",
  "The sound system is next level. My ears are blessed",
  "This is why I love Vancouver's underground scene",
  "Already planning to come back next week",
  "The energy in this room is electric ⚡",
  "Made so many new friends tonight. Inner City bringing people together!",
  "This venue is a hidden gem. More people need to know about this",
  "The vibes are unmatched. This is what community feels like",
];

const PLAN_POSTS = [
  "Planning to hit up the warehouse district this weekend. Who's in?",
  "Thinking about organizing a rooftop gathering next Friday. DM if interested!",
  "Want to explore the underground scene together? Let's make a plan!",
  "Planning a group outing to check out some new spots. Join us!",
  "Looking to form a crew for the upcoming festival. Let's connect!",
  "Planning a chill hangout at my favorite spot. Come through!",
  "Want to discover new music together? Let's plan a night out!",
  "Planning to check out multiple venues this weekend. Join the adventure!",
  "Organizing a pre-party before the main event. Hit me up!",
  "Planning an after-hours session. Who's down?",
];

const SPOT_RECOMMENDATIONS = [
  "This place has the best sound system in the city. Highly recommend!",
  "Amazing vibes and great crowd. The DJs here are incredible.",
  "Found this hidden gem. The atmosphere is unmatched.",
  "Perfect spot for techno lovers. The energy here is electric.",
  "This venue is a must-visit. The underground scene is thriving here.",
  "Best kept secret in Vancouver. Check it out if you get the chance!",
  "The sound quality here is insane. You have to experience it.",
  "Love the intimate setting. Great for connecting with the community.",
  "The staff here are so friendly. Makes the whole experience better.",
  "This spot never disappoints. Always a good time.",
];

const COMMENT_CONTENT = [
  "So jealous! Wish I could be there",
  "This looks amazing! When's the next one?",
  "I was there too! The energy was unreal",
  "Definitely going to check this out",
  "You're making me want to go so bad",
  "The best night! Can't wait for next time",
  "This is exactly what I needed to see",
  "Count me in for the next one!",
  "The vibes were immaculate",
  "Already planning my next visit",
  "This is why I love this community",
  "So glad you shared this!",
  "The sound system was incredible",
  "Met so many cool people there",
  "This spot is legendary",
];

const SPOT_NAMES = [
  "The Underground Club", "Warehouse 404", "Neon Nights", "The Basement",
  "Electric Avenue", "The Vault", "Midnight Sessions", "The Loft",
  "Dark Room", "The Crypt", "Sound System", "The Den",
  "Underground Vibes", "The Cellar", "After Hours",
];

const SPOT_ADDRESSES = [
  "123 Main St, Vancouver, BC",
  "456 Granville St, Vancouver, BC",
  "789 Hastings St, Vancouver, BC",
  "321 Commercial Dr, Vancouver, BC",
  "654 Davie St, Vancouver, BC",
  "987 Robson St, Vancouver, BC",
  "147 Pender St, Vancouver, BC",
  "258 Georgia St, Vancouver, BC",
];

const VANCOUVER_LAT = 49.2827;
const VANCOUVER_LNG = -123.1207;

function getRandomCoordinates(baseLat, baseLng) {
  const latOffset = (Math.random() - 0.5) * 0.1;
  const lngOffset = (Math.random() - 0.5) * 0.1;
  return {
    lat: baseLat + latOffset,
    lng: baseLng + lngOffset,
  };
}

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomElements(arr, count) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

async function createRichSocialFeed() {
  console.log('🚀 Creating rich social feed interactions...\n');

  // Get Vancouver city ID
  const { data: vancouverCity } = await supabase
    .from('cities')
    .select('id')
    .eq('name', 'Vancouver')
    .single();

  const cityId = vancouverCity?.id || 'vancouver';

  // Get all users
  const { data: users } = await supabase
    .from('profiles')
    .select('id, username')
    .or('home_city.eq.vancouver,username.ilike.mock%')
    .limit(100);

  if (!users || users.length === 0) {
    console.log('⚠️  No users found. Please run create-vancouver-mock-data.mjs first.');
    return;
  }

  // Get all events (user-generated and external)
  const { data: events } = await supabase
    .from('events')
    .select('id, title, start_at, city_id')
    .eq('city_id', cityId)
    .gte('start_at', new Date().toISOString())
    .limit(50);

  if (!events || events.length === 0) {
    console.log('⚠️  No events found. Please run create-vancouver-mock-data.mjs first.');
    return;
  }

  console.log(`Found ${users.length} users and ${events.length} events\n`);

  const now = new Date();
  let created = 0;

  // 1. Create diverse posts with realistic timing
  console.log('📝 Creating diverse posts...');
  const postsToCreate = [];
  
  users.forEach((user, index) => {
    // Each user creates 1-3 posts, distributed over last 7 days
    const postCount = Math.floor(Math.random() * 3) + 1;
    
    for (let i = 0; i < postCount; i++) {
      const postType = Math.random();
      let type, content, placeName, address, expiresAt, lat, lng, eventId;

      if (postType < 0.3) {
        // 30% regular interactive posts
        type = 'post';
        content = randomElement(INTERACTIVE_POSTS);
        // 20% chance it's related to an event
        if (Math.random() < 0.2 && events.length > 0) {
          eventId = randomElement(events).id;
        }
      } else if (postType < 0.6) {
        // 30% plans
        type = 'plan';
        content = randomElement(PLAN_POSTS);
        const expiresInHours = Math.floor(Math.random() * 168) + 24;
        expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString();
        if (Math.random() > 0.5) {
          const coords = getRandomCoordinates(VANCOUVER_LAT, VANCOUVER_LNG);
          lat = coords.lat;
          lng = coords.lng;
          address = randomElement(SPOT_ADDRESSES);
        }
      } else {
        // 40% spots
        type = 'spot';
        placeName = randomElement(SPOT_NAMES);
        content = randomElement(SPOT_RECOMMENDATIONS);
        address = randomElement(SPOT_ADDRESSES);
        const coords = getRandomCoordinates(VANCOUVER_LAT, VANCOUVER_LNG);
        lat = coords.lat;
        lng = coords.lng;
      }

      // Randomize creation time (within last 7 days, weighted toward recent)
      const daysAgo = Math.pow(Math.random(), 2) * 7; // Weighted toward recent
      const createdAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

      postsToCreate.push({
        user_id: user.id,
        type,
        content,
        city_id: cityId,
        event_id: eventId || null,
        place_name: placeName || null,
        address: address || null,
        lat: lat || null,
        lng: lng || null,
        expires_at: expiresAt || null,
        media_urls: [],
        likes_count: 0, // Will be updated by likes
        comments_count: 0, // Will be updated by comments
        created_at: createdAt,
        updated_at: createdAt,
      });
    }
  });

  // Insert posts in batches
  const BATCH_SIZE = 50;
  for (let i = 0; i < postsToCreate.length; i += BATCH_SIZE) {
    const batch = postsToCreate.slice(i, i + BATCH_SIZE);
    const { data: insertedPosts, error } = await supabase
      .from('user_posts')
      .insert(batch)
      .select('id, user_id');

    if (error) {
      console.error(`Error creating batch ${i / BATCH_SIZE + 1}:`, error);
    } else {
      created += batch.length;
      console.log(`✅ Created ${created}/${postsToCreate.length} posts...`);
      
      // Store post IDs for later interactions
      if (insertedPosts) {
        postsToCreate.slice(i, i + BATCH_SIZE).forEach((post, idx) => {
          if (insertedPosts[idx]) {
            post.id = insertedPosts[idx].id;
          }
        });
      }
    }
  }

  // 2. Create event RSVPs (going/interested) - these show up as activity
  console.log('\n🎫 Creating event RSVPs...');
  const rsvpsToCreate = [];
  const eventsWithRsvps = randomElements(events, Math.min(events.length, 30));
  
  eventsWithRsvps.forEach(event => {
    // 5-15 users RSVP to each event
    const rsvpCount = Math.floor(Math.random() * 11) + 5;
    const rsvpUsers = randomElements(users, Math.min(rsvpCount, users.length));
    
    rsvpUsers.forEach((user, idx) => {
      const status = idx < rsvpCount * 0.6 ? 'going' : 'interested'; // 60% going, 40% interested
      const createdAt = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString();
      
      rsvpsToCreate.push({
        event_id: event.id,
        user_id: user.id,
        status,
        is_public: true,
        created_at: createdAt,
        updated_at: createdAt,
      });
    });
  });

  // Insert RSVPs in batches
  for (let i = 0; i < rsvpsToCreate.length; i += BATCH_SIZE) {
    const batch = rsvpsToCreate.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('event_attendees')
      .insert(batch)
      .select();

    if (error) {
      console.error(`Error creating RSVP batch ${i / BATCH_SIZE + 1}:`, error);
    } else {
      console.log(`✅ Created ${Math.min(i + BATCH_SIZE, rsvpsToCreate.length)}/${rsvpsToCreate.length} RSVPs...`);
    }
  }

  // 3. Create check-ins to events (recent, within last 24 hours)
  console.log('\n📍 Creating event check-ins...');
  const checkInsToCreate = [];
  const eventsWithCheckIns = randomElements(events, Math.min(events.length, 15));
  
  eventsWithCheckIns.forEach(event => {
    // 3-8 users check in
    const checkInCount = Math.floor(Math.random() * 6) + 3;
    const checkInUsers = randomElements(users, Math.min(checkInCount, users.length));
    
    checkInUsers.forEach((user, idx) => {
      // Check-ins within last 24 hours, weighted toward recent
      const hoursAgo = Math.pow(Math.random(), 2) * 24;
      const checkedInAt = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();
      
      checkInsToCreate.push({
        event_id: event.id,
        user_id: user.id,
        status: 'going',
        is_public: true,
        checked_in_at: checkedInAt,
        created_at: checkedInAt,
        updated_at: checkedInAt,
      });
    });
  });

  // Insert check-ins (upsert to handle existing RSVPs)
  for (let i = 0; i < checkInsToCreate.length; i += BATCH_SIZE) {
    const batch = checkInsToCreate.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('event_attendees')
      .upsert(batch, { onConflict: 'event_id,user_id' })
      .select();

    if (error) {
      console.error(`Error creating check-in batch ${i / BATCH_SIZE + 1}:`, error);
    } else {
      console.log(`✅ Created ${Math.min(i + BATCH_SIZE, checkInsToCreate.length)}/${checkInsToCreate.length} check-ins...`);
    }
  }

  // 4. Create likes on posts (make posts feel engaged)
  console.log('\n❤️  Creating post likes...');
  const validPosts = postsToCreate.filter(p => p.id);
  const likesToCreate = [];
  
  validPosts.forEach(post => {
    // Each post gets 0-25 likes
    const likeCount = Math.floor(Math.random() * 26);
    const likers = randomElements(users, Math.min(likeCount, users.length));
    
    likers.forEach(liker => {
      // Don't like your own post
      if (liker.id !== post.user_id) {
        likesToCreate.push({
          post_id: post.id,
          user_id: liker.id,
          created_at: new Date(post.created_at).toISOString(),
        });
      }
    });
  });

  // Insert likes in batches
  for (let i = 0; i < likesToCreate.length; i += BATCH_SIZE) {
    const batch = likesToCreate.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('post_likes')
      .insert(batch)
      .select();

    if (error && !error.message.includes('duplicate')) {
      console.error(`Error creating like batch ${i / BATCH_SIZE + 1}:`, error.message);
    } else {
      console.log(`✅ Created ${Math.min(i + BATCH_SIZE, likesToCreate.length)}/${likesToCreate.length} likes...`);
    }
  }

  // 5. Create comments on posts
  console.log('\n💬 Creating post comments...');
  const commentsToCreate = [];
  const postsWithComments = randomElements(validPosts, Math.min(validPosts.length, 40));
  
  postsWithComments.forEach(post => {
    // Each post gets 1-8 comments
    const commentCount = Math.floor(Math.random() * 8) + 1;
    const commenters = randomElements(users, Math.min(commentCount, users.length));
    
    commenters.forEach((commenter, idx) => {
      // Don't comment on your own post
      if (commenter.id !== post.user_id) {
        const commentCreatedAt = new Date(
          new Date(post.created_at).getTime() + 
          (idx + 1) * Math.random() * 2 * 60 * 60 * 1000 // Comments within 2 hours of post
        ).toISOString();
        
        commentsToCreate.push({
          post_id: post.id,
          user_id: commenter.id,
          content: randomElement(COMMENT_CONTENT),
          created_at: commentCreatedAt,
          updated_at: commentCreatedAt,
        });
      }
    });
  });

  // Insert comments in batches
  for (let i = 0; i < commentsToCreate.length; i += BATCH_SIZE) {
    const batch = commentsToCreate.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('post_comments')
      .insert(batch)
      .select();

    if (error) {
      console.error(`Error creating comment batch ${i / BATCH_SIZE + 1}:`, error);
    } else {
      console.log(`✅ Created ${Math.min(i + BATCH_SIZE, commentsToCreate.length)}/${commentsToCreate.length} comments...`);
    }
  }

  // 6. Create friend connections (follows)
  console.log('\n👥 Creating friend connections...');
  const followsToCreate = [];
  
  // Each user follows 5-20 other users
  users.forEach(user => {
    const followCount = Math.floor(Math.random() * 16) + 5;
    const following = randomElements(
      users.filter(u => u.id !== user.id),
      Math.min(followCount, users.length - 1)
    );
    
    following.forEach(followed => {
      const createdAt = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
      followsToCreate.push({
        follower_id: user.id,
        following_id: followed.id,
        created_at: createdAt,
      });
    });
  });

  // Insert follows in batches
  for (let i = 0; i < followsToCreate.length; i += BATCH_SIZE) {
    const batch = followsToCreate.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('follows')
      .insert(batch)
      .select();

    if (error && !error.message.includes('duplicate')) {
      console.error(`Error creating follow batch ${i / BATCH_SIZE + 1}:`, error.message);
    } else {
      console.log(`✅ Created ${Math.min(i + BATCH_SIZE, followsToCreate.length)}/${followsToCreate.length} follows...`);
    }
  }

  console.log('\n🎉 Successfully created rich social feed!');
  console.log(`\nSummary:`);
  console.log(`  - Posts: ${postsToCreate.length}`);
  console.log(`  - RSVPs: ${rsvpsToCreate.length}`);
  console.log(`  - Check-ins: ${checkInsToCreate.length}`);
  console.log(`  - Likes: ${likesToCreate.length}`);
  console.log(`  - Comments: ${commentsToCreate.length}`);
  console.log(`  - Follows: ${followsToCreate.length}`);
}

// Run the script
createRichSocialFeed().catch(console.error);
