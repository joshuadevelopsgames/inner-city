
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User, City, Event, ThemeTokens, Notification, Ticket } from './types';
import { MOCK_USER, MOCK_CITIES, MOCK_EVENTS, MOCK_TICKETS } from './mockData';
import { THEMES } from './theme';
import { 
  searchEventsByCity, 
  convertTicketmasterEventToInnerCity, 
  getCountryCodeForCity 
} from './services/ticketmaster';
import { aggregateCityEvents, filterUpcomingEvents, sortEventsByDate } from './services/eventAggregator';
import { smartRankEvents, RankedEvents } from './services/eventRanking';
import { supabase } from './lib/supabase';

interface AppContextType {
  user: User | null;
  activeCity: City;
  setActiveCity: (city: City | ((prev: City) => City)) => void;
  events: Event[];
  tickets: Ticket[];
  addTicket: (ticket: Ticket) => void;
  theme: ThemeTokens;
  setThemeKey: (key: string) => void;
  notifications: Notification[];
  savedEventIds: string[];
  toggleSaveEvent: (id: string) => void;
  login: () => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  isTicketmasterConnected: boolean;
  setTicketmasterConnected: (val: boolean) => void;
  isLoadingTicketmasterEvents: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Helper to convert Supabase profile to app User type
const convertProfileToUser = (profile: any, authUser: any): User => {
  return {
    id: profile.id,
    username: profile.username || `user_${profile.id.substring(0, 8)}`,
    displayName: profile.display_name || authUser?.email?.split('@')[0] || 'User',
    avatarUrl: profile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.id}`,
    bio: profile.bio || '',
    socials: {}, // Can be extended later
    interests: profile.interests || [],
    homeCity: profile.home_city || '',
    travelCities: profile.travel_cities || [],
    profileMode: (profile.profile_mode as 'full' | 'minimal') || 'full',
    organizerTier: (profile.organizer_tier as 'none' | 'official') || 'none',
    verified: profile.verified || false,
    createdAt: profile.created_at || new Date().toISOString(),
  };
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [activeCity, setActiveCityState] = useState<City>(() => {
    try {
      const savedCityId = localStorage.getItem('inner_city_active');
      if (savedCityId) {
        const savedCity = MOCK_CITIES.find(city => city.id === savedCityId);
        if (savedCity) {
          return savedCity;
        }
      }
    } catch (e) {
      console.error('Failed to load active city from localStorage:', e);
    }
    return MOCK_CITIES[0]; // Default to Berlin
  });
  
  // Wrapper to persist city changes to localStorage
  const setActiveCity = (city: City | ((prev: City) => City)) => {
    if (typeof city === 'function') {
      // Handle function updates (for refresh triggers)
      setActiveCityState(prev => {
        const updated = city(prev);
        try {
          localStorage.setItem('inner_city_active', updated.id);
        } catch (e) {
          console.error('Failed to save active city to localStorage:', e);
        }
        return updated;
      });
    } else {
      // Handle direct city updates
      setActiveCityState(city);
      try {
        localStorage.setItem('inner_city_active', city.id);
      } catch (e) {
        console.error('Failed to save active city to localStorage:', e);
      }
    }
  };
  const [events, setEvents] = useState<Event[]>(MOCK_EVENTS);
  const [rankedEvents, setRankedEvents] = useState<RankedEvents | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>(MOCK_TICKETS.map(t => ({ ...t, source: 'native' })));
  // Auto-connect if API key is configured (universal key for the app)
  const [isTicketmasterConnected, setIsTicketmasterConnected] = useState(() => {
    const apiKey = import.meta.env.VITE_TICKETMASTER_API_KEY || 
                   (typeof process !== 'undefined' && process.env?.VITE_TICKETMASTER_API_KEY);
    return !!apiKey; // Auto-connect if API key exists
  });
  const [isLoadingTicketmasterEvents, setIsLoadingTicketmasterEvents] = useState(false);
  
  const [themeKey, setThemeKey] = useState<string>(() => {
    try {
      return localStorage.getItem('inner_city_theme') || 'dark-neutral';
    } catch {
      return 'dark-neutral';
    }
  });

  const [savedEventIds, setSavedEventIds] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const toggleSaveEvent = (id: string) => {
    setSavedEventIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const addTicket = (ticket: Ticket) => {
    setTickets(prev => [ticket, ...prev]);
  };

  // Initialize auth state and load user
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:128',message:'Auth useEffect started',data:{isLoadingUser},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,E,F'})}).catch(()=>{});
    // #endregion
    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    // Set a timeout to ensure loading state doesn't hang forever
    timeoutId = setTimeout(() => {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:133',message:'Timeout fired',data:{mounted,hasUser:!!user},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      if (mounted) {
        console.warn('Auth check timeout - setting loading to false');
        setIsLoadingUser(false);
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:137',message:'setIsLoadingUser(false) called from timeout',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        // If we timeout, assume no user is logged in
        if (!user) {
          setUser(null);
        }
      }
    }, 3000); // 3 second timeout (reduced from 5)
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:142',message:'Timeout set',data:{timeoutId:!!timeoutId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Check for existing session with timeout
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:145',message:'getSession() called',data:{supabaseUrl:!!import.meta.env.VITE_SUPABASE_URL,supabaseKey:!!import.meta.env.VITE_SUPABASE_ANON_KEY},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    // Try getSession but don't block - auth state change handler will handle session loading
    // This prevents infinite loading if getSession() hangs
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:147',message:'getSession() resolved',data:{mounted,hasError:!!error,hasSession:!!session,hasUser:!!session?.user},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        if (!mounted) {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:149',message:'Early return: not mounted',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
          // #endregion
          return;
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:151',message:'getSession resolved, clearing timeout',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        clearTimeout(timeoutId);
        
        if (error) {
          console.error('Error getting session:', error);
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:153',message:'Session error, setting loading false',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          setIsLoadingUser(false);
          return;
        }
        
        // Only process getSession result if auth state change hasn't already handled it
        // Check if user is already loaded to avoid duplicate work
        if (session?.user && !user) {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:201',message:'getSession: calling loadUserProfile (user not loaded yet)',data:{userId:session.user.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          
          // Add timeout to prevent hanging
          const profileTimeout = setTimeout(() => {
            if (mounted) {
              // #region agent log
              fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:207',message:'Profile load timeout, forcing stop',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
              setIsLoadingUser(false);
            }
          }, 2000);
          
          loadUserProfile(session.user.id).catch((err) => {
            clearTimeout(profileTimeout);
            console.error('Error loading user profile:', err);
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:216',message:'loadUserProfile error caught',data:{mounted,error:err.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            if (mounted) {
              setIsLoadingUser(false);
            }
          }).finally(() => {
            clearTimeout(profileTimeout);
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:225',message:'loadUserProfile finally block',data:{mounted},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            if (mounted) {
              clearTimeout(timeoutId);
            }
          });
        } else if (!session?.user) {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:169',message:'No session, setting loading false',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          setIsLoadingUser(false);
        }
      })
      .catch((error) => {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:172',message:'getSession() rejected',data:{mounted,error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        if (!mounted) return;
        console.error('Failed to get session:', error);
        clearTimeout(timeoutId);
        setIsLoadingUser(false);
      });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:180',message:'Auth state change event',data:{mounted,event,hasSession:!!session,hasUser:!!session?.user},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      if (!mounted) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:182',message:'Auth change: not mounted, returning',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E,F'})}).catch(()=>{});
        // #endregion
        return;
      }
      
      clearTimeout(timeoutId);
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:186',message:'Auth change: cleared timeout',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      
      if (session?.user) {
        // Always load profile on auth state change to ensure it's up to date
        // Add timeout to prevent hanging
        const profileTimeout = setTimeout(() => {
          if (mounted) {
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:192',message:'Profile load timeout in auth change, forcing stop',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            setIsLoadingUser(false);
          }
        }, 2000);
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:195',message:'Auth change: calling loadUserProfile',data:{userId:session.user.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C,E'})}).catch(()=>{});
        // #endregion
        
        try {
          await loadUserProfile(session.user.id);
          clearTimeout(profileTimeout);
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:200',message:'Auth change: loadUserProfile completed',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
        } catch (err) {
          clearTimeout(profileTimeout);
          console.error('Error in auth state change handler:', err);
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:204',message:'Auth change error, setting loading false',data:{error:err instanceof Error ? err.message : String(err)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          if (mounted) {
            setIsLoadingUser(false);
          }
        }
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:210',message:'No session in auth change, setting loading false',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        setUser(null);
        setIsLoadingUser(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const loadUserProfile = async (userId: string) => {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:263',message:'loadUserProfile started',data:{userId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    try {
      // Fetch profile and auth user in parallel with timeout
      const profileQuery = supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio, interests, home_city, travel_cities, profile_mode, organizer_tier, verified, created_at')
        .eq('id', userId)
        .maybeSingle();
      
      const authQuery = supabase.auth.getUser();
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:275',message:'loadUserProfile Promise.all timeout',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          reject(new Error('Profile fetch timeout'));
        }, 2000);
      });
      
      let profileResult, authResult;
      try {
        [profileResult, authResult] = await Promise.race([
          Promise.all([profileQuery, authQuery]),
          timeoutPromise
        ]) as [any, any];
      } catch (timeoutError) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:320',message:'Promise.all timed out, using fallback',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        // On timeout, try to get auth user at least (profile might not exist yet)
        // But add a quick timeout to this too
        try {
          const fallbackTimeout = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Fallback timeout')), 1000);
          });
          
          const { data: { user: authUser } } = await Promise.race([
            supabase.auth.getUser(),
            fallbackTimeout
          ]) as { data: { user: any } };
          
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:328',message:'Fallback: got auth user',data:{hasAuthUser:!!authUser},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          
          if (authUser) {
            // Create minimal user from auth data
            const minimalUser: User = {
              id: authUser.id,
              username: authUser.user_metadata?.username || `user_${authUser.id.substring(0, 8)}`,
              displayName: authUser.user_metadata?.display_name || authUser.email?.split('@')[0] || 'User',
              avatarUrl: authUser.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${authUser.id}`,
              bio: '',
              socials: {},
              interests: [],
              homeCity: '',
              travelCities: [],
              profileMode: 'full',
              organizerTier: 'none',
              verified: false,
              createdAt: authUser.created_at || new Date().toISOString(),
            };
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:348',message:'Fallback: setting minimal user and stopping load',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            setUser(minimalUser);
            setIsLoadingUser(false);
            return;
          }
        } catch (e) {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:355',message:'Fallback: auth user fetch also failed, forcing stop',data:{error:e instanceof Error ? e.message : String(e)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          // Even auth user fetch failed - just stop loading
        }
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:360',message:'Fallback: setting loading false (no user)',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        setIsLoadingUser(false);
        return;
      }

      const { data: profile, error } = profileResult;
      const { data: { user: authUser }, error: authError } = authResult;
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:350',message:'Profile and auth fetched',data:{hasProfile:!!profile,hasError:!!error,hasAuthUser:!!authUser,hasAuthError:!!authError},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      // If auth user fetch failed, we can't proceed
      if (authError || !authUser) {
        console.error('Failed to get auth user:', authError);
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:208',message:'Auth user fetch failed, setting loading false',data:{authError:authError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        setIsLoadingUser(false);
        return;
      }

      if (error) {
        // If profile doesn't exist yet (trigger might not have run), retry once quickly
        if (error.code === 'PGRST116' || error.message?.includes('No rows')) {
          // Only retry once with a shorter delay
          await new Promise(resolve => setTimeout(resolve, 300));
          const { data: retryProfile } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url, bio, interests, home_city, travel_cities, profile_mode, organizer_tier, verified, created_at')
            .eq('id', userId)
            .maybeSingle();
          
          if (retryProfile) {
            const appUser = convertProfileToUser(retryProfile, authUser);
            setUser(appUser);
            setIsLoadingUser(false);
            return;
          }
        }
        // For other errors, log but don't throw - allow user to continue
        console.warn('Profile fetch error (non-critical):', error);
      }

      if (profile) {
        const appUser = convertProfileToUser(profile, authUser);
        setUser(appUser);
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:198',message:'Profile found, user set',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
      } else {
        // Profile doesn't exist yet but user is authenticated
        // Create a minimal user object to allow navigation
        // The trigger will create the profile, and it will be picked up on next load
        const minimalUser: User = {
          id: authUser.id,
          username: authUser.user_metadata?.username || `user_${authUser.id.substring(0, 8)}`,
          displayName: authUser.user_metadata?.display_name || authUser.email?.split('@')[0] || 'User',
          avatarUrl: authUser.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${authUser.id}`,
          bio: '',
          socials: {},
          interests: [],
          homeCity: '',
          travelCities: [],
          profileMode: 'full',
          organizerTier: 'none',
          verified: false,
          createdAt: authUser.created_at || new Date().toISOString(),
        };
        setUser(minimalUser);
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:220',message:'No profile, minimal user set',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
      }
    } catch (error) {
      console.error('Failed to load user profile:', error);
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:222',message:'loadUserProfile catch block',data:{error:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      // Don't set user to null on error - allow them to continue
    } finally {
      // Always set loading to false, even if there were errors
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/500c6263-d9c5-4196-a88c-cf974eeb7593',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'store.tsx:226',message:'loadUserProfile finally block, setting loading false',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      setIsLoadingUser(false);
    }
  };

  const login = async () => {
    // Login is handled by the Login screen via Supabase Auth
    // The auth state change handler will automatically load the profile
    // This function is kept for compatibility but is now a no-op
    // to avoid duplicate API calls
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;

    try {
      // Map app User fields to Supabase profile fields
      const profileUpdates: any = {};
      if (updates.displayName !== undefined) profileUpdates.display_name = updates.displayName;
      if (updates.avatarUrl !== undefined) profileUpdates.avatar_url = updates.avatarUrl;
      if (updates.bio !== undefined) profileUpdates.bio = updates.bio;
      if (updates.interests !== undefined) profileUpdates.interests = updates.interests;
      if (updates.homeCity !== undefined) profileUpdates.home_city = updates.homeCity;
      if (updates.travelCities !== undefined) profileUpdates.travel_cities = updates.travelCities;
      if (updates.profileMode !== undefined) profileUpdates.profile_mode = updates.profileMode;
      if (updates.organizerTier !== undefined) profileUpdates.organizer_tier = updates.organizerTier;

      const { error } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', user.id);

      if (error) throw error;

      // Update local state
      setUser(prev => prev ? { ...prev, ...updates } : null);
    } catch (error) {
      console.error('Failed to update user profile:', error);
      // Still update local state for optimistic UI
      setUser(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  // Cache events by city to avoid refetching (with timestamp for stale detection)
  const cityEventsCache = useRef<Map<string, { events: Event[]; timestamp: number }>>(new Map());
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Fetch events from multiple sources when connected and city changes
  useEffect(() => {
    if (!isTicketmasterConnected) return;

    const cityKey = `${activeCity.id}-${activeCity.name}`;
    const now = Date.now();
    
    // Check cache and show immediately if available and fresh
    const cached = cityEventsCache.current.get(cityKey);
    const isCacheValid = cached && (now - cached.timestamp) < CACHE_DURATION;
    
    if (isCacheValid && cached.events.length > 0) {
      // Show cached events immediately for instant UI
      setEvents(cached.events);
      const ranked = smartRankEvents(cached.events, user);
      setRankedEvents(ranked);
      setIsLoadingTicketmasterEvents(false);
      // Still refresh in background if cache is getting stale (> 3 minutes)
      if (now - cached.timestamp > 3 * 60 * 1000) {
        // Refresh in background without blocking UI
        fetchCityEvents(true);
      }
      return;
    }

    // Show mock events immediately for instant UI feedback while fetching
    const mockEventsForCity = MOCK_EVENTS.filter(e => e.cityId === activeCity.id);
    if (mockEventsForCity.length > 0) {
      setEvents(mockEventsForCity);
      const ranked = smartRankEvents(mockEventsForCity, user);
      setRankedEvents(ranked);
    }

    // Fetch real events in background
    fetchCityEvents(false);

    async function fetchCityEvents(silent = false) {
      if (!silent) setIsLoadingTicketmasterEvents(true);
      try {
        // Use the aggregator to fetch from multiple sources (now in parallel)
        // Start with just music category for faster initial load, then fetch others in background
        const result = await aggregateCityEvents({
          cityName: activeCity.name,
          cityId: activeCity.id,
          categories: ['music'], // Start with just music for faster load
          limit: 15, // Reduced for faster initial load
          includeTicketmaster: true,
          includeEventbrite: false, // Skip Eventbrite on initial load for speed
        });

        // Filter to only upcoming events and sort by date
        const upcomingEvents = filterUpcomingEvents(result.events);
        const sortedEvents = sortEventsByDate(upcomingEvents);

        // Filter events to only show those for the current city
        const cityEvents = sortedEvents.filter(e => e.cityId === activeCity.id);

        // Cache the events for this city with timestamp
        cityEventsCache.current.set(cityKey, { events: cityEvents, timestamp: Date.now() });

        // Update events
        setEvents(cityEvents);
        
        // Rank events by user interests
        const ranked = smartRankEvents(cityEvents, user);
        setRankedEvents(ranked);

        console.log(`Fetched ${result.sources.total} events: ${result.sources.ticketmaster} from Ticketmaster`);

        // Fetch additional categories and Eventbrite in background (non-blocking)
        if (!silent) {
          // Don't await - let this run in background
          aggregateCityEvents({
            cityName: activeCity.name,
            cityId: activeCity.id,
            categories: ['sports', 'arts'],
            limit: 10,
            includeTicketmaster: true,
            includeEventbrite: !!import.meta.env.VITE_EVENTBRITE_API_TOKEN,
          }).then((additionalResult) => {
            const additionalUpcoming = filterUpcomingEvents(additionalResult.events);
            const additionalSorted = sortEventsByDate(additionalUpcoming);
            const additionalCityEvents = additionalSorted.filter(e => e.cityId === activeCity.id);
            
            // Merge with existing events, avoiding duplicates
            setEvents(prev => {
              const existingIds = new Set(prev.map(e => e.id));
              const newEvents = additionalCityEvents.filter(e => !existingIds.has(e.id));
              const merged = [...prev, ...newEvents];
              
              // Update cache with merged events
              cityEventsCache.current.set(cityKey, { events: merged, timestamp: Date.now() });
              
              // Re-rank with merged events
              const ranked = smartRankEvents(merged, user);
              setRankedEvents(ranked);
              
              return merged;
            });
          }).catch(err => {
            console.warn('Background event fetch failed:', err);
          });
        }
      } catch (error) {
        console.error('Failed to fetch city events:', error);
        // Fallback to Ticketmaster only if aggregator fails
        try {
          const countryCode = getCountryCodeForCity(activeCity.name);
          const response = await searchEventsByCity(activeCity.name, countryCode, {
            classificationName: 'music',
            size: 15, // Reduced for faster fallback
          });

          if (response._embedded?.events) {
            const tmEvents = response._embedded.events.map(tmEvent =>
              convertTicketmasterEventToInnerCity(tmEvent, activeCity.id, 'ticketmaster')
            );

            const cityEvents = tmEvents.filter(e => e.cityId === activeCity.id);
            cityEventsCache.current.set(cityKey, { events: cityEvents, timestamp: Date.now() });
            setEvents(cityEvents);
            
            const ranked = smartRankEvents(cityEvents, user);
            setRankedEvents(ranked);
          }
        } catch (fallbackError) {
          console.error('Fallback Ticketmaster fetch also failed:', fallbackError);
        }
      } finally {
        if (!silent) setIsLoadingTicketmasterEvents(false);
      }
    }
  }, [isTicketmasterConnected, activeCity.id, activeCity.name]);

  // Rank events whenever they or user interests change
  useEffect(() => {
    if (events.length > 0) {
      const ranked = smartRankEvents(events, user);
      setRankedEvents(ranked);
    } else {
      setRankedEvents(null);
    }
  }, [events, user?.interests]);

  const theme = THEMES[themeKey] || THEMES['dark-neutral'];

  const value = {
    user,
    activeCity,
    setActiveCity, // This is now the wrapper function that persists to localStorage
    events,
    rankedEvents,
    tickets,
    addTicket,
    theme,
    setThemeKey: (key: string) => {
      setThemeKey(key);
      try {
        localStorage.setItem('inner_city_theme', key);
      } catch (e) {}
    },
    notifications,
    savedEventIds,
    toggleSaveEvent,
    login,
    logout,
    updateUser,
    isTicketmasterConnected,
    setTicketmasterConnected: (val: boolean) => {
      setIsTicketmasterConnected(val);
      try {
        localStorage.setItem('inner_city_tm_connected', val ? 'true' : 'false');
      } catch (e) {}
      // Refresh events when connection status changes
      if (val) {
        // Trigger event refresh by updating activeCity (will trigger useEffect)
        setActiveCity(prev => ({ ...prev }));
      }
    },
    isLoadingTicketmasterEvents
  };

  useEffect(() => {
    if (!theme) return;
    document.documentElement.style.setProperty('--neon-accent', theme.accent);
    document.body.style.backgroundColor = theme.background;
    document.body.style.color = theme.text;
    document.body.style.transition = 'background-color 0.5s ease, color 0.5s ease';
    
    // Update theme-color meta tag for iOS status bar
    let themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeColorMeta);
    }
    themeColorMeta.setAttribute('content', theme.background);
    
    // Update apple-mobile-web-app-status-bar-style based on theme brightness
    // For dark themes: black-translucent (white text), for light: default (black text)
    const isLightTheme = theme.background === '#FFFFFF' || theme.background.toLowerCase() === '#ffffff';
    let statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (!statusBarMeta) {
      statusBarMeta = document.createElement('meta');
      statusBarMeta.setAttribute('name', 'apple-mobile-web-app-status-bar-style');
      document.head.appendChild(statusBarMeta);
    }
    statusBarMeta.setAttribute('content', isLightTheme ? 'default' : 'black-translucent');
    
    // Update html background to match theme
    document.documentElement.style.backgroundColor = theme.background;
    const rootElement = document.getElementById('root');
    if (rootElement) {
      rootElement.style.backgroundColor = theme.background;
    }
    
    // Update CSS custom property for status bar background
    document.documentElement.style.setProperty('--status-bar-bg', theme.background);
    
    // Add a style element to ensure status bar area is covered
    let statusBarStyle = document.getElementById('status-bar-style');
    if (!statusBarStyle) {
      statusBarStyle = document.createElement('style');
      statusBarStyle.id = 'status-bar-style';
      document.head.appendChild(statusBarStyle);
    }
    statusBarStyle.textContent = `
      body::before {
        background-color: var(--status-bar-bg, ${theme.background}) !important;
      }
    `;
  }, [theme]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
