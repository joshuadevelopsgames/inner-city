
import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Search, Plus, Bookmark, User, ChevronDown, Bell, Ticket as TicketIcon, MapPin, Music, Laugh, Users, Moon, Palette, Trophy, UtensilsCrossed, GraduationCap, Zap, Filter } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MOCK_CITIES } from '../mockData';
import { EventType } from '../types';

const EVENT_TYPES: Array<{ id: EventType; label: string; icon: React.ComponentType<any>; keywords: string[] }> = [
  { id: 'all', label: 'All Events', icon: Filter, keywords: [] },
  { id: 'concerts', label: 'Concerts', icon: Music, keywords: ['music', 'concert', 'live music', 'band', 'artist', 'performance'] },
  { id: 'comedy', label: 'Comedy', icon: Laugh, keywords: ['comedy', 'stand-up', 'improv', 'humor', 'jokes'] },
  { id: 'user-events', label: 'Hangouts', icon: Users, keywords: ['hangout', 'meetup', 'social', 'friends', 'community'] },
  { id: 'nightlife', label: 'Nightlife', icon: Moon, keywords: ['nightlife', 'club', 'dance', 'party', 'dj', 'electronic'] },
  { id: 'art-culture', label: 'Art & Culture', icon: Palette, keywords: ['art', 'culture', 'gallery', 'exhibition', 'museum', 'theater'] },
  { id: 'sports', label: 'Sports', icon: Trophy, keywords: ['sports', 'game', 'match', 'fitness', 'athletic'] },
  { id: 'food-drink', label: 'Food & Drink', icon: UtensilsCrossed, keywords: ['food', 'drink', 'dining', 'restaurant', 'bar', 'culinary'] },
  { id: 'workshops', label: 'Workshops', icon: GraduationCap, keywords: ['workshop', 'class', 'learning', 'education', 'seminar'] },
  { id: 'raves', label: 'Raves', icon: Zap, keywords: ['rave', 'techno', 'underground', 'warehouse', 'electronic music'] },
];

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, activeCity, activeEventType, setActiveEventType } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [showEventTypeDropdown, setShowEventTypeDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const mainContentRef = useRef<HTMLElement>(null);

  const navItems = [
    { icon: Home, path: '/', label: 'Feed' },
    { icon: Search, path: '/map', label: 'Map' },
    { icon: Plus, path: '/create', label: 'Create' },
    { icon: TicketIcon, path: '/wallet', label: 'Tickets' },
    { icon: Bookmark, path: '/saved', label: 'Saved' },
    { icon: User, path: '/profile', label: 'Profile', matchPattern: /^\/profile/ },
  ];

  const isLight = theme.background === '#FFFFFF';

  // Find current tab index
  const getCurrentTabIndex = () => {
    return navItems.findIndex(item => {
      if (item.matchPattern) {
        return item.matchPattern.test(location.pathname);
      }
      return item.path === location.pathname;
    });
  };

  // Helper to check if an element or its parents are horizontally scrollable
  const isHorizontallyScrollable = (element: HTMLElement | null): boolean => {
    if (!element) return false;
    
    try {
      let current: HTMLElement | null = element;
      while (current && current !== mainContentRef.current) {
        try {
          const style = window.getComputedStyle(current);
          const overflowX = style.overflowX;
          const overflow = style.overflow;
          
          // Check if element has horizontal scrolling
          if (
            overflowX === 'auto' || 
            overflowX === 'scroll' ||
            overflow === 'auto' || 
            overflow === 'scroll' ||
            current.scrollWidth > current.clientWidth
          ) {
            // Check if it's actually scrollable horizontally (not just vertically)
            if (current.scrollWidth > current.clientWidth) {
              return true;
            }
          }
          
          // Check for common scrollable class names or data attributes
          if (
            current.classList?.contains('overflow-x-auto') ||
            current.classList?.contains('overflow-x-scroll') ||
            current.hasAttribute('data-scrollable') ||
            current.hasAttribute('data-carousel') ||
            current.getAttribute('role') === 'region' // Carousels often have this
          ) {
            return true;
          }
        } catch (e) {
          // If we can't check this element, continue to parent
          console.warn('Error checking element scrollability:', e);
        }
        
        current = current.parentElement;
      }
    } catch (e) {
      console.warn('Error in isHorizontallyScrollable:', e);
      return false;
    }
    
    return false;
  };

  // Handle swipe navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    try {
      const target = e.target as HTMLElement;
      
      // Don't track if touching a scrollable element
      if (isHorizontallyScrollable(target)) {
        touchStartRef.current = null;
        return;
      }
      
      if (e.touches && e.touches.length > 0) {
        touchStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          time: Date.now(),
        };
      }
    } catch (error) {
      console.error('Touch start error:', error);
      touchStartRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    try {
      // Don't prevent default if we're not tracking or if touching scrollable element
      if (!touchStartRef.current) return;
      
      const target = e.target as HTMLElement;
      if (isHorizontallyScrollable(target)) {
        touchStartRef.current = null;
        return;
      }
      
      if (!e.touches || e.touches.length === 0) return;
      
      const deltaX = Math.abs(e.touches[0].clientX - touchStartRef.current.x);
      const deltaY = Math.abs(e.touches[0].clientY - touchStartRef.current.y);
      
      // Only prevent default if horizontal swipe is dominant and we're not on a scrollable element
      if (deltaX > deltaY && deltaX > 10) {
        // Double check the target hasn't changed to a scrollable element
        if (!isHorizontallyScrollable(target)) {
          e.preventDefault();
        }
      }
    } catch (error) {
      console.error('Touch move error:', error);
      touchStartRef.current = null;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    try {
      if (!touchStartRef.current) return;

      const target = e.target as HTMLElement;
      
      // Don't trigger tab switch if touching a scrollable element
      if (isHorizontallyScrollable(target)) {
        touchStartRef.current = null;
        return;
      }

      if (!e.changedTouches || e.changedTouches.length === 0) {
        touchStartRef.current = null;
        return;
      }

      const touchEnd = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
        time: Date.now(),
      };

      const deltaX = touchEnd.x - touchStartRef.current.x;
      const deltaY = touchEnd.y - touchStartRef.current.y;
      const deltaTime = touchEnd.time - touchStartRef.current.time;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      // Only trigger if:
      // - Horizontal swipe is more dominant than vertical
      // - Swipe distance is at least 50px
      // - Swipe duration is less than 300ms (quick swipe)
      // - Not on a page that shouldn't allow swiping (like event detail or chat)
      // - Not on a horizontally scrollable element
      const shouldSwipe = 
        absDeltaX > absDeltaY &&
        absDeltaX > 50 &&
        deltaTime < 300 &&
        !location.pathname.includes('/event/') &&
        !location.pathname.includes('/chat') &&
        !location.pathname.includes('/settings') &&
        !location.pathname.includes('/onboarding') &&
        !isHorizontallyScrollable(target);

      if (shouldSwipe) {
        const currentIndex = getCurrentTabIndex();
        
        // Only navigate if we have a valid current index
        if (currentIndex === -1) {
          return;
        }
        
        if (deltaX > 0 && currentIndex > 0) {
          // Swipe right - go to previous tab
          const prevPath = navItems[currentIndex - 1]?.path;
          if (prevPath) {
            navigate(prevPath);
          }
        } else if (deltaX < 0 && currentIndex < navItems.length - 1) {
          // Swipe left - go to next tab
          const nextPath = navItems[currentIndex + 1]?.path;
          if (nextPath) {
            navigate(nextPath);
          }
        }
      }
    } catch (error) {
      console.error('Touch end error:', error);
    } finally {
      touchStartRef.current = null;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowEventTypeDropdown(false);
      }
    };

    if (showEventTypeDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEventTypeDropdown]);

  const handleEventTypeSelect = (type: EventType) => {
    setActiveEventType(type);
    setShowEventTypeDropdown(false);
  };
  
  const currentEventType = EVENT_TYPES.find(t => t.id === activeEventType) || EVENT_TYPES[0];
  const EventTypeIcon = currentEventType.icon;

  // Ensure page starts at top on load (fixes PWA home screen issue)
  useEffect(() => {
    // Scroll to top on mount and when route changes
    window.scrollTo(0, 0);
    // Also ensure body is at top
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }, [location.pathname]);

  return (
    <div className="flex flex-col h-full relative" style={{ background: theme.background, color: theme.text }}>
      {/* Header */}
      {location.pathname !== '/onboarding' && (
        <header 
          className="sticky top-0 z-40 px-6 flex justify-between items-center ios-glass w-full max-w-md mx-auto" 
          style={{ 
            backgroundColor: theme.background,
            borderBottom: `1px solid ${theme.border}40`,
            paddingTop: `calc(env(safe-area-inset-top) + 1rem)`,
            paddingBottom: '1rem',
            minHeight: `calc(env(safe-area-inset-top) + 4rem)`,
            display: 'flex',
            alignItems: 'center',
            position: 'sticky',
            top: 0
          }}
        >
          {/* Status bar background extension */}
          <div 
            className="absolute top-0 left-0 right-0 pointer-events-none"
            style={{
              height: 'env(safe-area-inset-top)',
              backgroundColor: theme.background,
              top: `calc(-1 * env(safe-area-inset-top))`,
              zIndex: -1
            }}
          />
          <div className="relative mt-2" ref={dropdownRef}>
            <button
              onClick={() => setShowEventTypeDropdown(!showEventTypeDropdown)}
              className="flex items-center gap-2 px-4 py-2 rounded-full cursor-pointer active:scale-95 transition-transform" 
              style={{ backgroundColor: theme.surface, border: `1px solid ${theme.border}` }}
            >
              <EventTypeIcon size={14} color={theme.accent} strokeWidth={2.5} />
              <span className="text-[10px] font-black tracking-widest uppercase">{currentEventType.label}</span>
              <ChevronDown 
                size={12} 
                color={theme.accent} 
                strokeWidth={3}
                className={`transition-transform duration-200 ${showEventTypeDropdown ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Event Type Dropdown */}
            <AnimatePresence>
              {showEventTypeDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full left-0 mt-2 w-64 rounded-2xl bg-black/95 backdrop-blur-3xl border shadow-2xl overflow-hidden z-50"
                  style={{ borderColor: theme.border }}
                >
                  <div className="max-h-80 overflow-y-auto no-scrollbar">
                    {EVENT_TYPES.map((eventType) => {
                      const Icon = eventType.icon;
                      return (
                        <button
                          key={eventType.id}
                          onClick={() => handleEventTypeSelect(eventType.id)}
                          className={`w-full px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0 flex items-center gap-3 group ${
                            eventType.id === activeEventType ? 'bg-white/10' : ''
                          }`}
                        >
                          <Icon 
                            size={16} 
                            className={`flex-shrink-0 ${eventType.id === activeEventType ? 'opacity-100' : 'opacity-40'}`} 
                            color={eventType.id === activeEventType ? theme.accent : 'white'} 
                          />
                          <div className="flex-1 min-w-0">
                            <p className={`text-[10px] font-black uppercase tracking-widest truncate ${
                              eventType.id === activeEventType ? 'text-white' : 'text-white/80'
                            }`}>
                              {eventType.label}
                            </p>
                          </div>
                          {eventType.id === activeEventType && (
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.accent }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="flex items-center gap-1.5 ml-4 mt-2">
            <img 
              src="/inner-city.png" 
              alt="Inner City Logo" 
              className="w-10 h-10"
            />
            <h1 className="brand-font text-base font-black italic tracking-tighter uppercase">INNER CITY</h1>
          </div>

          <button 
            onClick={() => {
              if (location.pathname === '/notifications') {
                navigate(-1); // Go back if already on notifications page
              } else {
                navigate('/notifications');
              }
            }}
            className="p-2 rounded-full relative active:scale-90 transition-transform mt-2"
            style={{ backgroundColor: theme.surface }}
          >
            <Bell size={20} strokeWidth={2} />
            <div className="absolute top-2 right-2 w-2 h-2 rounded-full border-2 border-[var(--background)]" style={{ backgroundColor: theme.accent }} />
          </button>
        </header>
      )}

      {/* Main Content Area */}
      <main 
        ref={mainContentRef}
        className="flex-1 overflow-y-auto no-scrollbar pb-24"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Minimalist Bottom Bar */}
      {location.pathname !== '/onboarding' && !location.pathname.includes('/chat') && (
        <nav 
          className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 border-t ${isLight ? 'bg-white' : 'bg-black'}`}
          style={{ borderColor: isLight ? '#f3f4f6' : '#1f2937' }}
        >
          <div className="flex justify-around items-center h-20 safe-area-bottom px-2">
            {navItems.map((item) => {
              const isActive = item.matchPattern 
                ? item.matchPattern.test(location.pathname)
                : location.pathname === item.path;
              const Icon = item.icon;
              
              return (
                <Link 
                  key={item.path} 
                  to={item.path} 
                  className="flex-1 flex items-center justify-center h-full active:opacity-60 transition-opacity"
                  onClick={(e) => {
                    // If clicking profile while on a user profile, go to own profile
                    if (item.path === '/profile' && location.pathname.startsWith('/profile/')) {
                      e.preventDefault();
                      navigate('/profile');
                    }
                  }}
                >
                  <motion.div
                    whileTap={{ scale: 0.8 }}
                    className="relative"
                  >
                    <Icon 
                      size={24} 
                      strokeWidth={isActive ? 2.5 : 1.5}
                      fill={isActive ? (isLight ? '#000' : '#FFF') : 'none'}
                      style={{ 
                        color: isActive 
                          ? (isLight ? '#000' : '#FFF') 
                          : (isLight ? '#9ca3af' : '#6b7280'),
                        fillOpacity: isActive ? 0.3 : 1
                      }} 
                    />
                  </motion.div>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
};
