
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../store';
import { Event, CityPulse, UserPost } from '../types';
import { Badge, Card } from '../components/UI';
import { Heart, Bookmark, Share2, MapPin, Clock, Zap, PlayCircle, ShieldCheck, MessageCircle, MoreHorizontal, Send, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isValid, formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { MOCK_CITY_PULSES } from '../mockData';
import { getFeedPosts, likePost, unlikePost, checkPostLiked, getPostComments, addPostComment, createPost } from '../services/social';
import { supabase } from '../lib/supabase';
import { getOptimizedImageUrl } from '../utils/imageOptimization';

const PulseCard: React.FC<{ pulse: CityPulse }> = ({ pulse }) => {
  const { theme } = useApp();
  
  return (
    <motion.div 
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="flex-shrink-0 w-72 h-44 rounded-[2.5rem] overflow-hidden relative border mr-4"
      style={{ borderColor: theme.border, backgroundColor: theme.surface }}
    >
      <img src={pulse.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-50 grayscale hover:grayscale-0 transition-all duration-700" alt={pulse.title} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      
      <div className="absolute top-4 left-4">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20">
          <Zap size={10} className="text-primary" style={{ color: theme.accent }} />
          <span className="text-[8px] font-black uppercase tracking-widest text-white">{pulse.metric}</span>
        </div>
      </div>
      
      <div className="absolute bottom-5 left-5 right-5">
        <h4 className="text-xl font-black italic tracking-tighter uppercase text-white leading-none mb-1">{pulse.title}</h4>
        <p className="text-[10px] font-medium text-white/60 leading-tight line-clamp-2">{pulse.description}</p>
      </div>
    </motion.div>
  );
};

// Post Card Component
const PostCard: React.FC<{ post: UserPost }> = ({ post }) => {
  const { theme, user } = useApp();
  const [isLiked, setIsLiked] = useState(post.isLiked || false);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const isLight = theme.background === '#FFFFFF';

  useEffect(() => {
    if (user && post.id) {
      checkPostLiked(post.id, user.id).then(setIsLiked).catch(() => {});
    }
  }, [post.id, user]);

  const handleLike = async () => {
    if (!user) return;
    
    try {
      if (isLiked) {
        await unlikePost(post.id, user.id);
        setIsLiked(false);
        setLikesCount(prev => Math.max(0, prev - 1));
      } else {
        await likePost(post.id, user.id);
        setIsLiked(true);
        setLikesCount(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handleLoadComments = async () => {
    if (showComments || isLoadingComments) return;
    setIsLoadingComments(true);
    try {
      const postComments = await getPostComments(post.id);
      setComments(postComments);
      setShowComments(true);
    } catch (error) {
      console.error('Error loading comments:', error);
    } finally {
      setIsLoadingComments(false);
    }
  };

  const handleAddComment = async () => {
    if (!user || !commentInput.trim()) return;
    
    try {
      const newComment = await addPostComment(post.id, user.id, commentInput);
      setComments(prev => [...prev, { ...newComment, user }]);
      setCommentInput('');
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  return (
    <Card className="mb-6 mx-6 !rounded-[2.5rem] overflow-hidden">
      {/* Post Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <Link to={`/profile/${post.user?.id || post.userId}`} className="flex items-center gap-3">
          <img 
            src={post.user?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.userId}`} 
            className="w-12 h-12 rounded-2xl border-2"
            style={{ borderColor: theme.border }}
            alt={post.user?.displayName || 'User'}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black uppercase italic tracking-tight">
                {post.user?.displayName || 'User'}
              </span>
              {post.user?.verified && (
                <ShieldCheck size={14} className={isLight ? 'text-black' : 'text-white'} />
              )}
            </div>
            <span className="text-[9px] font-medium opacity-50">
              {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
              {post.event && ` • at ${post.event.title}`}
            </span>
          </div>
        </Link>
        <button className="p-2 opacity-40 hover:opacity-100 transition-opacity">
          <MoreHorizontal size={18} />
        </button>
      </div>

      {/* Post Content */}
      <div className="px-6 pb-4">
        <p className="text-sm leading-relaxed mb-4" style={{ color: theme.text }}>
          {post.content}
        </p>

        {/* Post Media */}
        {post.mediaUrls && post.mediaUrls.length > 0 && (
          <div className="mb-4 rounded-2xl overflow-hidden">
            {post.mediaUrls.length === 1 ? (
              <img src={post.mediaUrls[0]} className="w-full rounded-2xl object-cover" alt="Post media" />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {post.mediaUrls.slice(0, 4).map((url, i) => (
                  <img key={i} src={url} className="w-full aspect-square object-cover rounded-xl" alt={`Post media ${i + 1}`} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Event Link */}
        {post.event && (
          <Link 
            to={`/event/${post.event.id}`}
            className="block p-4 rounded-2xl mb-4 border transition-all hover:scale-[1.02]"
            style={{ backgroundColor: theme.surfaceAlt, borderColor: theme.border }}
          >
            <div className="flex items-center gap-3">
              <img 
                src={getOptimizedImageUrl(post.event.mediaUrls[0], 'thumbnail')} 
                className="w-16 h-16 rounded-xl object-cover"
                alt={post.event.title}
                loading="lazy"
                decoding="async"
              />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-black uppercase italic tracking-tight truncate mb-1">
                  {post.event.title}
                </h4>
                <div className="flex items-center gap-2 text-[9px] opacity-60">
                  <MapPin size={10} />
                  <span>{post.event.venueName}</span>
                </div>
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* Post Actions */}
      <div className="px-6 pb-4 flex items-center gap-6 border-t" style={{ borderColor: theme.border }}>
        <button 
          onClick={handleLike}
          className="flex items-center gap-2 text-[10px] font-black tracking-widest uppercase active:scale-90 transition-transform"
          style={{ color: isLiked ? theme.accent : theme.textDim }}
        >
          <Heart size={18} fill={isLiked ? theme.accent : 'none'} />
          {likesCount}
        </button>
        <button 
          onClick={handleLoadComments}
          className="flex items-center gap-2 text-[10px] font-black tracking-widest uppercase active:scale-90 transition-transform"
          style={{ color: theme.textDim }}
        >
          <MessageCircle size={18} />
          {post.commentsCount}
        </button>
        <button className="flex items-center gap-2 text-[10px] font-black tracking-widest uppercase active:scale-90 transition-transform" style={{ color: theme.textDim }}>
          <Share2 size={18} />
          Share
        </button>
      </div>

      {/* Comments Section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t overflow-hidden"
            style={{ borderColor: theme.border }}
          >
            <div className="px-6 py-4 max-h-64 overflow-y-auto space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="flex items-start gap-3">
                  <img 
                    src={comment.user?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.userId}`}
                    className="w-8 h-8 rounded-xl flex-shrink-0"
                    alt={comment.user?.displayName || 'User'}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-black uppercase italic tracking-tight">
                        {comment.user?.displayName || 'User'}
                      </span>
                      <span className="text-[8px] opacity-40">
                        {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: theme.text }}>
                      {comment.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Comment Input */}
            {user && (
              <div className="px-6 pb-4 pt-2 border-t" style={{ borderColor: theme.border }}>
                <div className="flex items-center gap-2">
                  <input
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                    placeholder="Add a comment..."
                    className="flex-1 px-4 py-2 rounded-xl text-sm outline-none"
                    style={{ backgroundColor: theme.surfaceAlt, color: theme.text }}
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={!commentInput.trim()}
                    className="p-2 rounded-xl transition-all active:scale-90 disabled:opacity-30"
                    style={{ backgroundColor: theme.accent }}
                  >
                    <Send size={16} color={isLight ? '#FFF' : '#000'} />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};

const EventCard: React.FC<{ event: Event }> = ({ event }) => {
  const { theme, toggleSaveEvent, savedEventIds } = useApp();
  const isSaved = savedEventIds.includes(event.id);
  const isLight = theme.background === '#FFFFFF';
  
  const { isLive, formattedTime, isTonight } = useMemo(() => {
    const now = new Date();
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    
    const validStart = isValid(start);
    const validEnd = isValid(end);

    return {
      isLive: validStart && validEnd && now >= start && now <= end,
      formattedTime: validStart ? format(start, 'HH:mm') : 'TBA',
      isTonight: validStart && start.getTime() < now.getTime() + 86400000 && start.getTime() > now.getTime(),
    };
  }, [event.startAt, event.endAt]);
  
  const isOfficial = event.tier === 'official';

  return (
    <Card 
      className={`mb-10 mx-6 relative border-none !rounded-[2.5rem] transition-all duration-500 overflow-visible`}
      style={{ 
        boxShadow: isOfficial && !isLight ? `0 0 30px ${theme.accent}15` : 'none'
      }}
    >
      {isOfficial && !isLight && (
        <div className="absolute -inset-0.5 rounded-[2.5rem] blur opacity-20 pointer-events-none" 
             style={{ background: `linear-gradient(45deg, ${theme.accent}, transparent, ${theme.accent})` }} />
      )}

      <Link to={`/event/${event.id}`} className="block relative z-10">
        <div className="relative aspect-[4/5] overflow-hidden rounded-t-[2.5rem]">
          <img 
            src={getOptimizedImageUrl(event.mediaUrls[0], 'card')} 
            alt={event.title} 
            className="w-full h-full object-cover transition-transform duration-1000 hover:scale-105"
            loading="lazy"
            decoding="async"
          />
          <div className={`absolute inset-0 bg-gradient-to-t ${isLight ? 'from-white/95 via-transparent' : 'from-black/95 via-transparent'} to-transparent`} />
          
          <div className="absolute top-5 left-5 flex flex-wrap gap-2">
            {isOfficial ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-black shadow-lg">
                <ShieldCheck size={12} strokeWidth={3} />
                <span className="text-[9px] font-black uppercase tracking-widest">Official</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md text-white border border-white/10">
                <span className="text-[9px] font-black uppercase tracking-widest">Community</span>
              </div>
            )}
            
            {isTonight && <Badge label="Tonight" type="tonight" />}
          </div>

          {isLive && (
            <div className="absolute top-5 right-5 flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)] animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_5px_white]" />
              <span className="text-[9px] font-black uppercase tracking-widest text-white">Live Now</span>
            </div>
          )}

          <div className="absolute bottom-6 left-6 right-6">
            <h3 className={`text-4xl font-bold tracking-tighter mb-3 leading-[0.85] uppercase italic font-display ${isLight ? 'text-black' : 'text-white'}`}>
              {event.title}
            </h3>
            <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-black tracking-widest uppercase opacity-70 ${isLight ? 'text-black' : 'text-white'}`}>
              <div className="flex items-center gap-1.5">
                <Clock size={12} strokeWidth={2.5} />
                <span>{formattedTime}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin size={12} strokeWidth={2.5} />
                <span>{event.venueName} • {isOfficial ? 'Central' : 'Secret Location'}</span>
              </div>
            </div>
          </div>
        </div>
      </Link>
      
      <div className="flex justify-between items-center px-6 py-5 rounded-b-[2.5rem] relative z-10" style={{ backgroundColor: theme.surface }}>
        <div className="flex items-center gap-8">
          <button className="flex items-center gap-2 text-[10px] font-black tracking-widest uppercase active:scale-90 transition-transform group">
            <Heart size={18} className="group-active:fill-current" />
            {event.counts.likes}
          </button>
          <button className="flex items-center gap-2 text-[10px] font-black tracking-widest uppercase active:scale-90 transition-transform">
            <Share2 size={18} />
            Relay
          </button>
        </div>
        <button 
          onClick={() => toggleSaveEvent(event.id)}
          className="p-1 transition-transform active:scale-90"
          style={{ color: isSaved ? theme.accent : theme.textDim }}
        >
          <Bookmark size={22} fill={isSaved ? theme.accent : 'none'} />
        </button>
      </div>
    </Card>
  );
};

// Event type keywords for filtering
// Using Ticketmaster segment/genre classifications and keyword matching
const EVENT_TYPE_KEYWORDS: Record<string, { segments?: string[], genres?: string[], keywords: string[], exclude?: string[] }> = {
  'all': { keywords: [] },
  'concerts': {
    segments: ['Music'],
    genres: ['Rock', 'Pop', 'Jazz', 'Country', 'R&B', 'Hip-Hop', 'Classical', 'Folk', 'Reggae', 'Blues', 'Metal', 'Punk', 'Alternative', 'Indie'],
    keywords: ['concert', 'live music', 'band', 'artist', 'gig', 'tour', 'album', 'singer', 'musician'],
    exclude: ['sports', 'hockey', 'basketball', 'football', 'baseball', 'soccer', 'game', 'match', 'vs', 'versus']
  },
  'comedy': {
    segments: ['Comedy'],
    keywords: ['comedy', 'stand-up', 'improv', 'humor', 'jokes', 'comic', 'laugh', 'comedian']
  },
  'user-events': {
    keywords: ['hangout', 'meetup', 'social', 'friends', 'community', 'chill', 'gathering']
  },
  'nightlife': {
    segments: ['Music'],
    genres: ['Electronic', 'Dance', 'House', 'Techno', 'Trance'],
    keywords: ['nightlife', 'club', 'dance', 'party', 'dj', 'electronic', 'nightclub', 'bar', 'nightlife']
  },
  'art-culture': {
    segments: ['Arts & Theatre'],
    keywords: ['art', 'culture', 'gallery', 'exhibition', 'museum', 'theater', 'theatre', 'arts', 'exhibit', 'sculpture', 'painting']
  },
  'sports': {
    segments: ['Sports'],
    genres: ['Hockey', 'Basketball', 'Football', 'Baseball', 'Soccer', 'Tennis', 'Golf', 'Boxing', 'MMA', 'Wrestling'],
    keywords: ['sports', 'game', 'match', 'fitness', 'athletic', 'sport', 'competition', 'hockey', 'basketball', 'football', 'baseball', 'soccer', 'vs', 'versus', 'nhl', 'nba', 'nfl', 'mlb']
  },
  'food-drink': {
    keywords: ['food', 'drink', 'dining', 'restaurant', 'culinary', 'cuisine', 'tasting', 'wine', 'beer', 'cocktail', 'food festival', 'food truck', 'brunch', 'dinner', 'lunch', 'cooking class', 'chef'],
    exclude: ['music', 'concert', 'live music', 'band', 'artist', 'dj', 'performance', 'show', 'gig', 'tour', 'nightlife', 'club', 'dance', 'party']
  },
  'workshops': {
    keywords: ['workshop', 'class', 'learning', 'education', 'seminar', 'course', 'training', 'lesson']
  },
  'raves': {
    segments: ['Music'],
    genres: ['Electronic', 'House', 'Techno', 'Trance', 'Dubstep'],
    keywords: ['rave', 'techno', 'underground', 'warehouse', 'electronic music', 'edm', 'house music', 'drum and bass', 'dnb']
  },
};

const filterEventsByType = (events: Event[], eventType: string): Event[] => {
  if (eventType === 'all') return events;
  
  // Special handling for user events (hangouts) - these are events created by users, not from APIs
  if (eventType === 'user-events') {
    return events.filter(event => 
      event.organizerId !== 'ticketmaster' && 
      event.organizerId !== 'eventbrite' &&
      !event.ticketmasterId &&
      !event.eventbriteId
    );
  }
  
  const typeConfig = EVENT_TYPE_KEYWORDS[eventType];
  if (!typeConfig || typeConfig.keywords.length === 0) return events;
  
  return events.filter(event => {
    // First check Ticketmaster/Eventbrite classifications (most accurate)
    const categories = event.categories || [];
    const subcategories = event.subcategories || [];
    
    // Check segment match (highest priority)
    if (typeConfig.segments) {
      const hasSegmentMatch = typeConfig.segments.some(segment => 
        categories.some(cat => cat.toLowerCase().includes(segment.toLowerCase()))
      );
      if (hasSegmentMatch) {
        // If we have a segment match, check exclusions
        if (typeConfig.exclude) {
          const searchText = `${event.title} ${event.shortDesc} ${categories.join(' ')} ${subcategories.join(' ')}`.toLowerCase();
          const hasExclusion = typeConfig.exclude.some(ex => searchText.includes(ex.toLowerCase()));
          if (hasExclusion) return false;
        }
        return true;
      }
    }
    
    // Check genre match (medium priority)
    if (typeConfig.genres) {
      const hasGenreMatch = typeConfig.genres.some(genre => 
        subcategories.some(sub => sub.toLowerCase().includes(genre.toLowerCase())) ||
        categories.some(cat => cat.toLowerCase().includes(genre.toLowerCase()))
      );
      if (hasGenreMatch) {
        // Check exclusions
        if (typeConfig.exclude) {
          const searchText = `${event.title} ${event.shortDesc} ${categories.join(' ')} ${subcategories.join(' ')}`.toLowerCase();
          const hasExclusion = typeConfig.exclude.some(ex => searchText.includes(ex.toLowerCase()));
          if (hasExclusion) return false;
        }
        return true;
      }
    }
    
    // Fallback to keyword matching (lowest priority)
    const searchText = `${event.title} ${event.shortDesc} ${event.longDesc} ${categories.join(' ')} ${subcategories.join(' ')}`.toLowerCase();
    
    // Check exclusions first
    if (typeConfig.exclude) {
      const hasExclusion = typeConfig.exclude.some(ex => searchText.includes(ex.toLowerCase()));
      if (hasExclusion) return false;
    }
    
    // For food-drink, also exclude if it's clearly a music event by segment/genre
    if (eventType === 'food-drink') {
      // Exclude if it's a Music segment event
      if (categories.some(cat => cat.toLowerCase().includes('music'))) {
        return false;
      }
      // Exclude if it has music-related genres
      const musicGenres = ['rock', 'pop', 'jazz', 'country', 'hip-hop', 'r&b', 'classical', 'folk', 'reggae', 'blues', 'metal', 'punk', 'alternative', 'indie', 'electronic', 'dance', 'house', 'techno', 'trance', 'dubstep', 'edm'];
      if (subcategories.some(sub => musicGenres.some(genre => sub.toLowerCase().includes(genre)))) {
        return false;
      }
    }
    
    // Check keywords
    return typeConfig.keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
  });
};

export const Feed: React.FC = () => {
  const { events, rankedEvents, activeCity, activeEventType, theme, user, refreshFeed, isLoadingTicketmasterEvents } = useApp();
  const [activeMood, setActiveMood] = useState('All');
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  
  const moods = ['All', 'Deep & Dark', 'High Energy', 'Soulful', 'Experimental'];
  const cityEvents = events.filter(e => e.cityId === activeCity.id);
  const filteredCityEvents = useMemo(() => filterEventsByType(cityEvents, activeEventType), [cityEvents, activeEventType]);
  const cityPulses = MOCK_CITY_PULSES.filter(p => p.cityId === activeCity.id);
  const isLight = theme.background === '#FFFFFF';

  // Load posts on mount and when city or event type changes
  useEffect(() => {
    loadPosts();
  }, [activeCity.id, activeEventType]);

  // Pull-to-refresh handler
  useEffect(() => {
    const handleScroll = () => {
      if (isRefreshing || isLoadingTicketmasterEvents) return;
      
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      
      // Trigger refresh when scrolled to top
      if (scrollTop < 50 && !isRefreshing && refreshFeed) {
        setIsRefreshing(true);
        Promise.all([
          refreshFeed(),
          loadPosts()
        ]).finally(() => {
          setIsRefreshing(false);
        });
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [refreshFeed, isRefreshing, isLoadingTicketmasterEvents]);

  const loadPosts = async () => {
    setIsLoadingPosts(true);
    try {
      const feedPosts = await getFeedPosts(user?.id);
      // Filter posts by city and event type (if they have an event)
      const cityPosts = feedPosts.filter(post => 
        !post.eventId || filteredCityEvents.some(e => e.id === post.eventId)
      );
      setPosts(cityPosts);
    } catch (error) {
      console.error('Error loading posts:', error);
      setPosts([]);
    } finally {
      setIsLoadingPosts(false);
    }
  };

  // Use ranked events if available, otherwise fall back to regular events
  const displayEvents = useMemo(() => {
    if (rankedEvents) {
      // Show priority events first, then background events with reduced opacity
      const priority = filterEventsByType(rankedEvents.priority.filter(e => e.cityId === activeCity.id), activeEventType);
      const background = filterEventsByType(rankedEvents.background.filter(e => e.cityId === activeCity.id), activeEventType);
      return {
        priority,
        background,
      };
    }
    return {
      priority: filteredCityEvents,
      background: [],
    };
  }, [rankedEvents, filteredCityEvents, activeCity.id, activeEventType]);

  const isLoading = isLoadingTicketmasterEvents || isLoadingPosts;

  return (
    <div ref={feedRef} className="pb-10 pt-4 relative">
      {/* Pull-to-refresh indicator */}
      {isRefreshing && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full backdrop-blur-md border" 
             style={{ backgroundColor: theme.surface, borderColor: theme.border }}>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.accent }} />
            <span className="text-[10px] font-black uppercase tracking-widest">Refreshing...</span>
          </div>
        </div>
      )}
      <div className="px-6 mb-8 flex items-end justify-between gap-4">
        <div className="flex-1 min-w-0" style={{ maxWidth: 'calc(100% - 120px)' }}>
          <span className="text-[10px] font-black tracking-[0.4em] uppercase opacity-40 block mb-1">Gateway // {activeCity.country}</span>
          <h2 
            className={`font-black tracking-tighter leading-none uppercase italic ${activeCity.name.length > 18 ? 'truncate' : ''}`}
            style={{ 
              fontSize: 'clamp(1.5rem, 4vw + 0.5rem, 2.5rem)',
              lineHeight: '1',
              maxWidth: '100%',
            }}
          >
            {activeCity.name}
          </h2>
        </div>
        <div className="flex -space-x-3 mb-1 flex-shrink-0" style={{ minWidth: '100px' }}>
           {[1,2,3].map(i => (
             <img key={i} src={`https://picsum.photos/seed/face${i}/50/50`} className="w-8 h-8 rounded-full border-2 flex-shrink-0" style={{ borderColor: theme.background }} />
           ))}
        </div>
      </div>

      <div className="mb-10">
        <div className="px-6 flex items-center gap-2 mb-4">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">Now Peaking</h3>
        </div>
        <div className="flex overflow-x-auto no-scrollbar px-6 gap-5">
          {(displayEvents.priority.length > 0 ? displayEvents.priority : cityEvents).slice(0, 5).map(event => (
            <Link key={event.id} to={`/event/${event.id}`} className="flex-shrink-0 w-20 flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-full border-2 p-1 active:scale-95 transition-all" style={{ borderColor: theme.accent }}>
                <div className="w-full h-full rounded-full overflow-hidden relative">
                   <img 
                     src={getOptimizedImageUrl(event.mediaUrls[0], 'thumbnail')} 
                     className="w-full h-full object-cover brightness-75"
                     loading="lazy"
                     decoding="async"
                   />
                   <div className="absolute inset-0 flex items-center justify-center">
                     <PlayCircle size={20} className="text-white opacity-80" />
                   </div>
                </div>
              </div>
              <span className="text-[8px] font-black uppercase tracking-tight text-center line-clamp-1 opacity-60 leading-tight">{event.venueName}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-10">
        <div className="px-6 mb-4 flex justify-between items-center">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">City Insights</h3>
          <button className="text-[9px] font-black uppercase tracking-widest text-primary" style={{ color: theme.accent }}>The Descent</button>
        </div>
        <div className="flex overflow-x-auto no-scrollbar px-6">
          {cityPulses.map(pulse => <PulseCard key={pulse.id} pulse={pulse} />)}
        </div>
      </div>

      <div className="mb-10 overflow-x-auto no-scrollbar px-6 flex gap-2">
        {moods.map(mood => (
          <button 
            key={mood}
            onClick={() => setActiveMood(mood)}
            className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${activeMood === mood ? 'bg-primary border-primary text-white' : 'border-white/10 opacity-40'}`}
            style={{ 
              backgroundColor: activeMood === mood ? theme.accent : 'transparent',
              borderColor: activeMood === mood ? theme.accent : theme.border,
              color: activeMood === mood ? (isLight ? '#FFF' : '#000') : theme.text
            }}
          >
            {mood}
          </button>
        ))}
      </div>

      {/* Loading indicator */}
      {isLoading && !isRefreshing && (
        <div className="px-6 mb-10 flex items-center justify-center">
          <div className="px-4 py-2 rounded-full backdrop-blur-md border" 
               style={{ backgroundColor: theme.surface, borderColor: theme.border }}>
            <div className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" style={{ color: theme.accent }} />
              <span className="text-[10px] font-black uppercase tracking-widest">Loading...</span>
            </div>
          </div>
        </div>
      )}

      {/* Social Feed - Posts from Events and Users */}
      {posts.length > 0 && (
        <div className="mb-10">
          <div className="px-6 mb-4 flex items-center justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">Community Pulse</h3>
            {user && (
              <button
                onClick={() => setShowCreatePost(true)}
                className="px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
                style={{ backgroundColor: theme.accent, color: isLight ? '#FFF' : '#000' }}
              >
                + Post
              </button>
            )}
          </div>
          {posts.map(post => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {/* Priority Events - Front and Center */}
      {displayEvents.priority.length > 0 && (
        <div className="flex flex-col mb-6">
          <div className="px-6 mb-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">Featured Events</h3>
          </div>
          {displayEvents.priority.map(event => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* Background Events - Reduced Opacity */}
      {displayEvents.background.length > 0 && (
        <div className="flex flex-col">
          <div className="px-6 mb-4">
            <h3 className="text-[9px] font-black uppercase tracking-[0.3em] opacity-60">
              More Events
            </h3>
          </div>
          {displayEvents.background.map(event => (
            <div key={event.id} className="opacity-75 hover:opacity-100 transition-opacity">
              <EventCard event={event} />
            </div>
          ))}
        </div>
      )}

      {/* Create Post Modal */}
      <AnimatePresence>
        {showCreatePost && user && (
          <CreatePostModal 
            onClose={() => setShowCreatePost(false)}
            onPostCreated={() => {
              setShowCreatePost(false);
              loadPosts();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// Create Post Modal Component
const CreatePostModal: React.FC<{ onClose: () => void; onPostCreated: () => void }> = ({ onClose, onPostCreated }) => {
  const { theme, user, events, activeCity } = useApp();
  const [content, setContent] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [isPosting, setIsPosting] = useState(false);
  const isLight = theme.background === '#FFFFFF';

  const handleSubmit = async () => {
    if (!user || !content.trim()) return;
    
    setIsPosting(true);
    try {
      await createPost(user.id, content, selectedEventId || undefined);
      onPostCreated();
    } catch (error) {
      console.error('Error creating post:', error);
    } finally {
      setIsPosting(false);
    }
  };

  // Filter events to current city
  const cityEvents = events.filter(e => e.cityId === activeCity.id);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: theme.surface, border: `1px solid ${theme.border}` }}
      >
        <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-6">Create Post</h2>
        
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">
              What's happening?
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className="w-full px-4 py-3 rounded-2xl outline-none text-sm resize-none"
              style={{ backgroundColor: theme.surfaceAlt, color: theme.text, border: `1px solid ${theme.border}` }}
              placeholder="Share your thoughts about an event, ask questions, or connect with the community..."
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 block">
              Link to Event (Optional)
            </label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl outline-none text-sm"
              style={{ backgroundColor: theme.surfaceAlt, color: theme.text, border: `1px solid ${theme.border}` }}
            >
              <option value="">No event</option>
              {cityEvents.slice(0, 20).map(event => (
                <option key={event.id} value={event.id}>{event.title}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSubmit}
            disabled={!content.trim() || isPosting}
            className="flex-1 px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: theme.accent, color: theme.background === '#FFFFFF' ? '#FFF' : '#000' }}
          >
            {isPosting ? 'Posting...' : 'Post'}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-95"
            style={{ backgroundColor: theme.surfaceAlt, color: theme.text }}
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
