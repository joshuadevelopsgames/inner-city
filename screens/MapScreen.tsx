
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Search, Filter, Navigation, Compass, X, AlertCircle, Zap, Map as MapIcon } from 'lucide-react';
import { Badge, Card } from '../components/UI';
import { Link } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import { Event } from '../types';

const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_ACCESS_TOKEN || 'pk.eyJ1Ijoiam9zaHVhcm9hZGVyIiwiYSI6ImNta2l4MzduaTEyYzkzZXEzdHY5dmlxdDEifQ.Ch-Yoo2bvEGrdcr3ph_MaQ';

/**
 * Calculate days until event (negative if past, 0 if today, positive if future)
 */
const getDaysUntilEvent = (event: Event): number => {
  try {
    const now = new Date();
    const eventDate = new Date(event.startAt);
    const diffTime = eventDate.getTime() - now.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch {
    return 999; // Far future if date parsing fails
  }
};

/**
 * Convert hex color to RGB
 */
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

/**
 * Get color for event based on how soon it is
 * Today = red, then transitions through theme colors
 */
const getEventColor = (event: Event, theme: any): string => {
  const daysUntil = getDaysUntilEvent(event);
  
  // Events happening today (0 days) = red
  if (daysUntil <= 0) {
    return '#FF0000'; // Bright red for today/past
  }
  
  // Events 1-3 days away = red-orange gradient
  if (daysUntil <= 3) {
    const intensity = daysUntil / 3; // 0 to 1
    // Interpolate from red (#FF0000) to orange (#FF6600)
    const r = 255;
    const g = Math.floor(102 * (1 - intensity));
    const b = 0;
    return `rgb(${r}, ${g}, ${b})`;
  }
  
  // Events 4-7 days away = orange to theme accent
  if (daysUntil <= 7) {
    const intensity = (daysUntil - 3) / 4; // 0 to 1
    // Interpolate from orange (#FF6600) to theme accent
    const accentRgb = hexToRgb(theme.accent);
    if (accentRgb) {
      const r = Math.floor(255 + (accentRgb.r - 255) * intensity);
      const g = Math.floor(102 + (accentRgb.g - 102) * intensity);
      const b = Math.floor(0 + (accentRgb.b - 0) * intensity);
      return `rgb(${r}, ${g}, ${b})`;
    }
    return '#FF6600';
  }
  
  // Events 8-14 days away = theme accent to lighter variant
  if (daysUntil <= 14) {
    const intensity = (daysUntil - 7) / 7; // 0 to 1
    const accentRgb = hexToRgb(theme.accent);
    if (accentRgb) {
      // Blend towards a lighter/muted version
      const r = Math.floor(accentRgb.r + (accentRgb.r * 0.3) * intensity);
      const g = Math.floor(accentRgb.g + (accentRgb.g * 0.3) * intensity);
      const b = Math.floor(accentRgb.b + (accentRgb.b * 0.3) * intensity);
      return `rgb(${Math.min(255, r)}, ${Math.min(255, g)}, ${Math.min(255, b)})`;
    }
    return theme.accent;
  }
  
  // Events further than 14 days = muted theme color
  return theme.accent + '80'; // Add transparency for far future events
};

/**
 * Get color for cluster based on soonest event
 */
const getClusterColor = (events: Event[], theme: any): string => {
  if (events.length === 0) return theme.accent;
  
  // Find the event happening soonest
  const sortedByDate = [...events].sort((a, b) => {
    const daysA = getDaysUntilEvent(a);
    const daysB = getDaysUntilEvent(b);
    return daysA - daysB;
  });
  
  return getEventColor(sortedByDate[0], theme);
};

// High-fidelity fallback Map UI for when Mapbox is blocked or fails
const SimulatedMap: React.FC<{ events: any[], onSelect: (id: string) => void, theme: any }> = ({ events, onSelect, theme }) => {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden" style={{ backgroundColor: theme.background }}>
      {/* Cyber Grid Pattern */}
      <div 
        className="absolute inset-0" 
        style={{ 
          backgroundImage: `
            linear-gradient(to right, ${theme.accent}15 1px, transparent 1px),
            linear-gradient(to bottom, ${theme.accent}15 1px, transparent 1px)
          `, 
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(circle at center, black, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(circle at center, black, transparent 80%)'
        }} 
      />
      
      {/* Scanning Line Animation */}
      <motion.div 
        animate={{ top: ['0%', '100%', '0%'] }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        className="absolute left-0 right-0 h-[2px] z-0 pointer-events-none opacity-20"
        style={{ background: `linear-gradient(to right, transparent, ${theme.accent}, transparent)` }}
      />

      {/* Simulated City Infrastructure - Glowing Blocks */}
      <div className="relative w-full h-full opacity-30 perspective-1000 rotate-x-12">
        <div className="absolute top-[20%] left-[15%] w-48 h-32 border-2 rounded-xl blur-[1px]" style={{ borderColor: theme.accent }} />
        <div className="absolute top-[45%] right-[20%] w-64 h-24 border-2 rounded-xl blur-[1px]" style={{ borderColor: theme.accent }} />
        <div className="absolute bottom-[20%] left-[30%] w-32 h-64 border-2 rounded-xl blur-[1px]" style={{ borderColor: theme.accent }} />
        <div className="absolute top-[60%] left-[10%] w-24 h-48 border-2 rounded-xl blur-[1px]" style={{ borderColor: theme.accent }} />
      </div>

      {/* Data Pulse Elements */}
      {[1, 2, 3].map(i => (
        <motion.div
          key={`pulse-${i}`}
          animate={{ scale: [1, 2], opacity: [0.3, 0] }}
          transition={{ duration: 4, repeat: Infinity, delay: i * 1.3 }}
          className="absolute w-[500px] h-[500px] rounded-full border pointer-events-none"
          style={{ borderColor: theme.accent }}
        />
      ))}

      {/* Simulated Pins */}
      {events.map((event, i) => {
        const x = (event.id.charCodeAt(0) * 13) % 70 + 15;
        const y = (event.id.charCodeAt(event.id.length-1) * 11) % 60 + 20;
        const isOfficial = event.tier === 'official';
        const eventColor = getEventColor(event, theme);
        
        return (
          <motion.button
            key={event.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.1, type: "spring", damping: 12 }}
            onClick={() => onSelect(event.id)}
            className="absolute z-10 p-2.5 rounded-full border-2 active:scale-150 transition-all group"
            style={{ 
              left: `${x}%`, 
              top: `${y}%`,
              backgroundColor: eventColor,
              borderColor: isOfficial ? '#FFF' : theme.border,
              boxShadow: `0 0 30px ${eventColor}80`
            }}
          >
            <MapPin size={18} color={isOfficial ? '#000' : theme.text} />
            {isOfficial && (
              <div className="absolute -top-1 -right-1">
                <div className="w-3 h-3 bg-white rounded-full flex items-center justify-center shadow-lg">
                  <Zap size={8} fill="black" stroke="black" />
                </div>
              </div>
            )}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
               <span className="text-[8px] font-black uppercase tracking-widest bg-black/80 px-2 py-1 rounded text-white border border-white/10">
                 {event.venueName}
               </span>
            </div>
          </motion.button>
        );
      })}

      {/* UI Footer for Simulated Mode */}
      <div className="absolute bottom-40 left-0 right-0 flex flex-col items-center gap-3">
        <motion.div 
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/10"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]" />
          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white">Grid Signal Active</span>
        </motion.div>
        <p className="text-[8px] font-black uppercase tracking-widest opacity-20">Fallback interface engaged // Privacy Sandbox</p>
      </div>
    </div>
  );
};

interface GeocodingResult {
  id: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
  place_type: string[];
}

export const MapScreen: React.FC = () => {
  const { events, theme, activeCity } = useApp();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [mapError, setMapError] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [currentZoom, setCurrentZoom] = useState<number>(12);
  
  // Safety check - ensure component is mounted before processing
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);
  const [locationPermission, setLocationPermission] = useState<'prompt' | 'granted' | 'denied' | 'checking'>('prompt');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchedLocation, setSearchedLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<{ [key: string]: mapboxgl.Marker }>({});

  const cityEvents = useMemo(() => {
    try {
      // Show all events with valid coordinates on the map (not filtered by city)
      // Filter out events with invalid coordinates (0,0 or NaN)
      return events.filter(e => {
        if (!e) return false;
        if (typeof e.lat !== 'number' || typeof e.lng !== 'number') return false;
        if (isNaN(e.lat) || isNaN(e.lng)) return false;
        // Filter out events with coordinates of 0,0 (invalid coordinates)
        if (e.lat === 0 && e.lng === 0) return false;
        return true;
      });
    } catch (e) {
      console.error('Error filtering city events:', e);
      return [];
    }
  }, [events]);
  
  const selectedEvent = events.find(e => e.id === selectedEventId);
  const [selectedCluster, setSelectedCluster] = useState<{ location: { lat: number; lng: number }; events: Event[] } | null>(null);

  // Group events by location with dynamic threshold based on zoom level
  // Lower zoom (zoomed out) = larger threshold (more clustering)
  // Higher zoom (zoomed in) = smaller threshold (less clustering)
  const groupEventsByLocation = (events: Event[], zoomLevel: number) => {
    try {
      if (!events || events.length === 0) return [];
      
      const groups: Map<string, Event[]> = new Map();
      
      // Dynamic threshold based on zoom level - extremely aggressive clustering
      // At zoom 4-6: All events in city cluster together (very large threshold)
      // At zoom 8: ~50km threshold (large neighborhoods cluster)
      // At zoom 10: ~5km threshold (areas cluster)
      // At zoom 12: ~500m threshold (nearby venues cluster)
      // At zoom 14: ~100m threshold (same building cluster)
      // At zoom 16: ~20m threshold (very close only)
      
      let finalThreshold: number;
      
      // For very low zoom levels (4-7), force all events in city to cluster together
      if (zoomLevel <= 7) {
        // Use a very large threshold to cluster entire city - ~200km (1.8 degrees)
        finalThreshold = 1.8;
      } else {
        // For higher zoom levels, use exponential scaling
        const baseThreshold = 0.00018; // ~20 meters in degrees (base for zoom 12)
        // More aggressive scaling: 2^(16 - zoomLevel) gives even more dramatic differences
        const zoomFactor = Math.pow(2, 16 - zoomLevel);
        const LOCATION_THRESHOLD = baseThreshold * zoomFactor;
        
        // Cap maximum threshold at ~200km (1.8 degrees) for low zoom
        const MAX_THRESHOLD = 1.8;
        const MIN_THRESHOLD = 0.00001; // ~1 meter minimum
        finalThreshold = Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, LOCATION_THRESHOLD));
      }

      events.forEach(event => {
        try {
          // Validate event has valid coordinates
          if (!event || typeof event.lat !== 'number' || typeof event.lng !== 'number' || 
              isNaN(event.lat) || isNaN(event.lng) || event.lat === 0 && event.lng === 0) {
            return;
          }

          // Find existing group for this location
          let foundGroup = false;
          for (const [key, groupEvents] of groups.entries()) {
            try {
              const [groupLat, groupLng] = key.split(',').map(Number);
              if (isNaN(groupLat) || isNaN(groupLng)) continue;
              
              const distance = Math.sqrt(
                Math.pow(event.lat - groupLat, 2) + Math.pow(event.lng - groupLng, 2)
              );

              if (distance < finalThreshold) {
                // Add to existing group
                groupEvents.push(event);
                foundGroup = true;
                break;
              }
            } catch (e) {
              console.warn('Error checking group distance:', e);
              continue;
            }
          }

          // Create new group if no nearby group found
          if (!foundGroup) {
            const key = `${event.lat},${event.lng}`;
            groups.set(key, [event]);
          }
        } catch (e) {
          console.warn('Error processing event in grouping:', e);
        }
      });

      return Array.from(groups.entries()).map(([key, groupEvents]) => {
        try {
          const [lat, lng] = key.split(',').map(Number);
          if (isNaN(lat) || isNaN(lng) || groupEvents.length === 0) {
            return null;
          }
          // Use average location for the cluster
          const avgLat = groupEvents.reduce((sum, e) => sum + (e.lat || 0), 0) / groupEvents.length;
          const avgLng = groupEvents.reduce((sum, e) => sum + (e.lng || 0), 0) / groupEvents.length;
          if (isNaN(avgLat) || isNaN(avgLng)) return null;
          
          return {
            location: { lat: avgLat, lng: avgLng },
            events: groupEvents
          };
        } catch (e) {
          console.warn('Error creating group entry:', e);
          return null;
        }
      }).filter((group): group is { location: { lat: number; lng: number }; events: Event[] } => group !== null);
    } catch (error) {
      console.error('Error in groupEventsByLocation:', error);
      return [];
    }
  };

  const eventGroups = useMemo(() => groupEventsByLocation(cityEvents, currentZoom), [cityEvents, currentZoom]);

  // Request location permission on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      console.warn('Geolocation is not supported by this browser');
      setLocationPermission('denied');
      return;
    }

    // Check if permission was previously granted and get location
    const checkPermission = async () => {
      // Small delay to let the map render first
      setTimeout(() => {
        try {
          // Try to get current position to check permission status
          navigator.geolocation.getCurrentPosition(
            (position) => {
              // Permission already granted - get location and center map
              const { latitude, longitude } = position.coords;
              setUserLocation({ lat: latitude, lng: longitude });
              setLocationPermission('granted');
              setShowPermissionPrompt(false);
              
              // Center map on user location once map is loaded
              if (mapRef.current && !mapError) {
                const centerMap = () => {
                  if (mapRef.current) {
                    mapRef.current.flyTo({
                      center: [longitude, latitude],
                      zoom: 14,
                      duration: 1500,
                    });

                    // Add user location marker
                    const el = document.createElement('div');
                    el.className = 'user-location-marker';
                    el.innerHTML = `
                      <div class="relative flex items-center justify-center w-8 h-8">
                        <div class="absolute inset-0 rounded-full bg-blue-500 opacity-30 animate-ping"></div>
                        <div class="relative z-10 w-6 h-6 rounded-full bg-blue-500 border-2 border-white shadow-lg"></div>
                      </div>
                    `;

                    const userMarker = new mapboxgl.Marker(el)
                      .setLngLat([longitude, latitude])
                      .addTo(mapRef.current!);

                    (markersRef.current as any).__userLocation = userMarker;
                  }
                };

                if (mapRef.current.loaded()) {
                  centerMap();
                } else {
                  mapRef.current.once('load', centerMap);
                }
              }
            },
            (error) => {
              // Handle POSITION_UNAVAILABLE gracefully - it's expected on desktop without GPS
              if (error.code === error.POSITION_UNAVAILABLE) {
                // Position unavailable (common on desktop without GPS)
                // Don't log as error - this is expected behavior
                console.log('Position unavailable - desktop may not have GPS. User can search for location.');
                setLocationPermission('prompt');
                setShowPermissionPrompt(false); // Don't show prompt for unavailable position
                return; // Exit early - don't process other error handling
              }
              
              // Log other errors appropriately
              if (error.code === error.PERMISSION_DENIED) {
                // User denied permission
                console.log('Location permission denied by user');
                setLocationPermission('denied');
                setShowPermissionPrompt(false);
              } else if (error.code === error.TIMEOUT) {
                // Timeout - show prompt so user can try again
                console.warn('Location request timed out');
                setLocationPermission('prompt');
                setShowPermissionPrompt(true);
              } else {
                // Other errors
                console.warn('Geolocation error:', error.code, error.message);
                setLocationPermission('prompt');
                setShowPermissionPrompt(true);
              }
            },
            { 
              enableHighAccuracy: false, // Better for desktop - faster and less battery
              timeout: 10000, // 10 seconds - desktop browsers need more time for IP geolocation
              maximumAge: 300000 // 5 minutes - allow cached location for faster response
            }
          );
        } catch (e) {
          // If we can't check, show the prompt
          setLocationPermission('prompt');
          setShowPermissionPrompt(true);
        }
      }, 1000); // Increased delay to ensure map is initialized
    };

    checkPermission();
  }, [mapError]);

  // Request location when user grants permission
  const requestLocation = () => {
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported');
      return;
    }

    setLocationPermission('checking');
    // Don't hide prompt immediately - wait for browser's native prompt response
    // On desktop, the browser will show its own permission dialog

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude });
          setLocationPermission('granted');
          setShowPermissionPrompt(false);

          // Center map on user location
          const centerMapOnUser = () => {
            if (mapRef.current && !mapError) {
              // Remove existing user location marker if any
              if ((markersRef.current as any).__userLocation) {
                (markersRef.current as any).__userLocation.remove();
              }

              mapRef.current.flyTo({
                center: [longitude, latitude],
                zoom: 14,
                duration: 1500,
              });

              // Add user location marker
              const el = document.createElement('div');
              el.className = 'user-location-marker';
              el.innerHTML = `
                <div class="relative flex items-center justify-center w-8 h-8">
                  <div class="absolute inset-0 rounded-full bg-blue-500 opacity-30 animate-ping"></div>
                  <div class="relative z-10 w-6 h-6 rounded-full bg-blue-500 border-2 border-white shadow-lg"></div>
                </div>
              `;

              const userMarker = new mapboxgl.Marker(el)
                .setLngLat([longitude, latitude])
                .addTo(mapRef.current);

              // Store reference to remove later if needed
              (markersRef.current as any).__userLocation = userMarker;
            }
          };

          // Wait for map to be ready if needed
          if (mapRef.current && mapRef.current.loaded()) {
            centerMapOnUser();
          } else if (mapRef.current) {
            mapRef.current.once('load', centerMapOnUser);
          } else {
            // Map not ready yet, wait a bit
            setTimeout(centerMapOnUser, 500);
          }
        },
        (error) => {
          // Handle POSITION_UNAVAILABLE gracefully - it's expected on desktop without GPS
          if (error.code === error.POSITION_UNAVAILABLE) {
            // Position unavailable (common on desktop without GPS)
            // Don't log as error - this is expected behavior
            console.log('Position unavailable - desktop may not have GPS. User can search for location.');
            setLocationPermission('prompt');
            setShowPermissionPrompt(false); // Don't show prompt for unavailable position
            // User can use search bar to find location
            return; // Exit early - don't process other error handling
          }
          
          // Log other errors
          if (error.code === error.PERMISSION_DENIED) {
            // User denied permission
            console.log('Location permission denied by user');
            setLocationPermission('denied');
            setShowPermissionPrompt(false);
          } else if (error.code === error.TIMEOUT) {
            // Timeout - might need to check browser settings
            console.warn('Location request timed out');
            setLocationPermission('prompt');
            setShowPermissionPrompt(true);
          } else {
            // Other errors
            console.warn('Geolocation error:', error.code, error.message);
            setLocationPermission('prompt');
            setShowPermissionPrompt(true);
          }
        },
        {
          enableHighAccuracy: false, // Better for desktop - faster and less battery
          timeout: 15000, // 15 seconds - desktop browsers need more time for IP geolocation
          maximumAge: 300000 // 5 minutes - allow cached location for faster response
        }
      );
    } catch (err) {
      console.error('Error requesting location:', err);
      setLocationPermission('prompt');
      setShowPermissionPrompt(true);
    }
  };

  const dismissPermissionPrompt = () => {
    setShowPermissionPrompt(false);
    setLocationPermission('denied');
  };

  // Geocode search query using Mapbox Geocoding API
  const searchLocation = async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=5&types=place,address,poi`
      );
      
      if (!response.ok) {
        throw new Error('Geocoding request failed');
      }

      const data = await response.json();
      setSearchResults(data.features || []);
      setShowSearchResults(true);
    } catch (error) {
      console.error('Error searching location:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle search input change with debouncing
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(() => {
      searchLocation(value);
    }, 300);
  };

  // Handle selecting a search result
  const handleSelectLocation = (result: GeocodingResult) => {
    const [lng, lat] = result.center;
    setSearchedLocation({ lat, lng, name: result.place_name });
    setSearchQuery(result.place_name);
    setShowSearchResults(false);

    // Center map on selected location
    if (mapRef.current && !mapError) {
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: 14,
        duration: 1500,
      });

      // Remove existing search marker if any
      if ((markersRef.current as any).__searchLocation) {
        (markersRef.current as any).__searchLocation.remove();
      }

      // Add marker for searched location
      const el = document.createElement('div');
      el.className = 'search-location-marker';
      el.innerHTML = `
        <div class="relative flex items-center justify-center w-10 h-10">
          <div class="absolute inset-0 rounded-full bg-purple-500 opacity-30 animate-ping"></div>
          <div class="relative z-10 w-8 h-8 rounded-full bg-purple-500 border-2 border-white shadow-lg flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          </div>
        </div>
      `;

      const searchMarker = new mapboxgl.Marker(el)
        .setLngLat([lng, lat])
        .addTo(mapRef.current);

      (markersRef.current as any).__searchLocation = searchMarker;
    }
  };

  // Cleanup search timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Small delay to ensure container is fully rendered
    const initTimeout = setTimeout(() => {
      if (!mapContainerRef.current) return;

      const container = mapContainerRef.current;
      const rect = container.getBoundingClientRect();
      
      if (rect.width === 0 || rect.height === 0) {
        console.error('Map container has no dimensions:', rect.width, 'x', rect.height);
        setMapError(true);
        return;
      }

      try {
      mapboxgl.accessToken = MAPBOX_TOKEN;
        
        // Configure worker URL to use the bundled version from node_modules
        // This fixes the "Cannot read properties of undefined (reading 'send')" error
        if (typeof window !== 'undefined' && (mapboxgl as any).workerUrl === undefined) {
          // Let Mapbox use its default worker configuration from the npm package
          // The worker will be bundled correctly when using the npm package instead of CDN
        }
        
        console.log('Initializing Mapbox...');
        console.log('Mapbox token:', MAPBOX_TOKEN ? 'Present (' + MAPBOX_TOKEN.substring(0, 20) + '...)' : 'Missing');
        console.log('Mapbox token source:', (import.meta as any).env?.VITE_MAPBOX_ACCESS_TOKEN ? 'Environment variable' : 'Fallback');
        console.log('Map container dimensions:', rect.width, 'x', rect.height);
      
      // Use light style for light themes, dark for dark themes
      const isLightTheme = theme.background === '#FFFFFF';
      const mapStyle = isLightTheme 
        ? 'mapbox://styles/mapbox/light-v11' 
        : 'mapbox://styles/mapbox/dark-v11';
      
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: mapStyle,
        center: [activeCity.coordinates?.lng || 13.4050, activeCity.coordinates?.lat || 52.5200],
        zoom: 12,
        attributionControl: false,
        trackResize: true,
      });

      map.on('error', (e) => {
        console.error("Mapbox error:", e.error);
        console.error("Mapbox error message:", e.error?.message);
        // Handle worker-related errors gracefully
        if (e.error?.message?.includes('send') || 
            e.error?.message?.includes('worker') ||
            e.error?.message?.includes('undefined')) {
          console.warn("Mapbox worker error detected, but continuing...");
          // Don't set mapError for worker issues, let it try to recover
          return;
        }
        // Only set error for specific critical issues
        if (e.error?.message?.includes('Location') || 
            e.error?.message?.includes('cross-origin') ||
            e.error?.message?.includes('Unauthorized') ||
            e.error?.message?.includes('Invalid token')) {
          setMapError(true);
        }
      });

      map.on('load', () => {
        console.log("Mapbox loaded successfully");
        setMapError(false);
        setMapLoaded(true);
        // Set initial zoom level
        if (mapRef.current) {
          setCurrentZoom(mapRef.current.getZoom());
        }
        // Ensure map is visible after load
        if (mapContainerRef.current) {
          mapContainerRef.current.style.opacity = '1';
        }
      });

      map.on('style.load', () => {
        console.log("Mapbox style loaded");
      });

      // Track zoom level changes for dynamic clustering
      // Only update on zoomend to avoid constant marker recreation during zoom
      let zoomTimeout: NodeJS.Timeout | null = null;
      map.on('zoom', () => {
        // Debounce zoom updates to avoid constant recreation
        if (zoomTimeout) clearTimeout(zoomTimeout);
        zoomTimeout = setTimeout(() => {
          if (mapRef.current) {
            const zoom = mapRef.current.getZoom();
            setCurrentZoom(zoom);
          }
        }, 150); // Wait 150ms after zoom stops changing
      });

      map.on('zoomend', () => {
        // Clear any pending timeout and update immediately
        if (zoomTimeout) {
          clearTimeout(zoomTimeout);
          zoomTimeout = null;
        }
        if (mapRef.current) {
          const zoom = mapRef.current.getZoom();
          setCurrentZoom(zoom);
        }
      });

      // Also update on moveend to catch pan operations
      map.on('moveend', () => {
        if (mapRef.current) {
          const zoom = mapRef.current.getZoom();
          setCurrentZoom(zoom);
        }
      });

      // Close cluster/event selection when clicking on map (but not on markers)
      map.on('click', (e) => {
        // Only close if clicking directly on the map, not on a marker
        // Markers handle their own click events which will stop propagation
        setSelectedCluster(null);
        setSelectedEventId(null);
      });

      mapRef.current = map;
    } catch (err: any) {
        console.error("Mapbox init failed:", err);
        console.error("Mapbox init error message:", err.message);
      setMapError(true);
    }
    }, 100);

    return () => {
      clearTimeout(initTimeout);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [activeCity.id]);

  // Update map style when theme changes
  useEffect(() => {
    if (!mapRef.current || mapError) return;
    
    const isLightTheme = theme.background === '#FFFFFF';
    const newStyle = isLightTheme 
      ? 'mapbox://styles/mapbox/light-v11' 
      : 'mapbox://styles/mapbox/dark-v11';
    
    // Only update if style is different
    const currentStyle = mapRef.current.getStyle();
    if (currentStyle && currentStyle.name !== newStyle.split('/').pop()) {
      mapRef.current.setStyle(newStyle);
    }
  }, [theme.background, mapError]);

  // Center map on user location when map loads and location is available
  useEffect(() => {
    if (!mapRef.current || mapError || !userLocation) return;

    const centerOnUser = () => {
      if (mapRef.current && userLocation) {
        // Remove existing user location marker if any
        if ((markersRef.current as any).__userLocation) {
          (markersRef.current as any).__userLocation.remove();
        }

        mapRef.current.flyTo({
          center: [userLocation.lng, userLocation.lat],
          zoom: 14,
          duration: 1500,
        });

        // Add user location marker
        const el = document.createElement('div');
        el.className = 'user-location-marker';
        el.innerHTML = `
          <div class="relative flex items-center justify-center w-8 h-8">
            <div class="absolute inset-0 rounded-full bg-blue-500 opacity-30 animate-ping"></div>
            <div class="relative z-10 w-6 h-6 rounded-full bg-blue-500 border-2 border-white shadow-lg"></div>
          </div>
        `;

        const userMarker = new mapboxgl.Marker(el)
          .setLngLat([userLocation.lng, userLocation.lat])
          .addTo(mapRef.current);

        (markersRef.current as any).__userLocation = userMarker;
      }
    };

    if (mapRef.current.loaded()) {
      centerOnUser();
    } else {
      mapRef.current.once('load', centerOnUser);
    }
  }, [userLocation, mapError]);

  useEffect(() => {
    if (!mapRef.current || mapError || !mapLoaded) return;

    // Wait for map to finish moving/zooming before updating markers
    // This prevents markers from appearing at wrong positions during map movement
    const updateMarkers = () => {
      if (!mapRef.current || mapError || !mapLoaded) return;

      try {
        const currentMarkers = markersRef.current;
        // Don't remove user location marker or search location marker
        Object.entries(currentMarkers).forEach(([key, m]) => {
          try {
            if (key !== '__userLocation' && key !== '__searchLocation' && m) {
              (m as mapboxgl.Marker).remove();
            }
          } catch (e) {
            console.warn('Error removing marker:', e);
          }
        });
        // Keep user location marker and search location marker, clear others
        const userMarker = (markersRef.current as any).__userLocation;
        const searchMarker = (markersRef.current as any).__searchLocation;
        markersRef.current = { 
          ...(userMarker ? { __userLocation: userMarker } : {}),
          ...(searchMarker ? { __searchLocation: searchMarker } : {})
        };

        // Add markers for event groups (clustered or single)
        if (!eventGroups || eventGroups.length === 0) return;

      // Use requestAnimationFrame to batch marker creation and avoid blocking UI
      let index = 0;
      const addMarkersBatch = () => {
        const BATCH_SIZE = 10; // Add 10 markers per frame
        const endIndex = Math.min(index + BATCH_SIZE, eventGroups.length);
        
        for (let i = index; i < endIndex; i++) {
          const group = eventGroups[i];
          if (!group) continue;

          try {
            if (!group || !group.location || !group.events || group.events.length === 0) continue;
            
            const { location, events: groupEvents } = group;
            const isCluster = groupEvents.length > 1;

            const el = document.createElement('div');
            el.className = 'custom-marker';
            el.style.background = 'transparent';
            el.style.border = 'none';
            
            // For clusters, use the most prominent event for styling
            const primaryEvent = groupEvents.find(e => e.tier === 'official') || groupEvents[0];
            if (!primaryEvent) continue;
            
            const isOfficial = primaryEvent.tier === 'official';
            const hasLiveEvent = groupEvents.some(e => {
              try {
                const now = Date.now();
                return new Date(e.startAt).getTime() < now && new Date(e.endAt).getTime() > now;
              } catch {
                return false;
              }
            });

            if (isCluster) {
              // Enhanced cluster marker with better visual representation
              const eventCount = groupEvents.length;
              const size = Math.min(48 + (eventCount * 2), 72); // Scale with count, max 72px
              const officialCount = groupEvents.filter(e => e.tier === 'official').length;
              const officialRatio = officialCount / eventCount;
              
              // Use time-based color (soonest event determines color)
              const timeBasedColor = getClusterColor(groupEvents, theme);
              // Blend with official ratio for visual distinction
              const primaryColor = officialRatio > 0.5 ? timeBasedColor : timeBasedColor + 'CC';
              
              // Create visual segments for event diversity
              const categories = new Set(groupEvents.map(e => e.categories?.[0] || 'event').slice(0, 3));
              const categoryCount = Math.min(categories.size, 3);
              
              // Container size needs to be larger to accommodate blur effects
              const containerSize = size + 40; // Add padding for blur/glow effects
              
              el.innerHTML = `
                <div class="relative flex items-center justify-center group cursor-pointer" style="width: ${containerSize}px; height: ${containerSize}px; padding: 20px; box-sizing: border-box;">
                  <!-- Outer glow ring - extends beyond visible circle -->
                  <div class="absolute inset-0 rounded-full blur-xl opacity-50 transition-all duration-300 group-hover:opacity-100 group-hover:blur-2xl" 
                       style="background: ${primaryColor}; box-shadow: 0 0 ${size * 1.5}px ${primaryColor}60; width: ${size}px; height: ${size}px; left: 50%; top: 50%; transform: translate(-50%, -50%);"></div>
                  
                  <!-- Pulsing ring for live events -->
                  ${hasLiveEvent ? `
                    <div class="absolute rounded-full animate-ping opacity-40" 
                         style="background-color: ${timeBasedColor}; animation-duration: 2s; width: ${size}px; height: ${size}px; left: 50%; top: 50%; transform: translate(-50%, -50%);"></div>
                    <div class="absolute rounded-full animate-pulse opacity-30" 
                         style="background-color: ${timeBasedColor}; animation-duration: 1.5s; width: ${size}px; height: ${size}px; left: 50%; top: 50%; transform: translate(-50%, -50%);"></div>
                  ` : ''}
                  
                  <!-- Main cluster circle with gradient -->
                  <div class="relative z-10 rounded-full border-2 border-white/30 transition-all duration-300 group-hover:scale-110 group-hover:border-white/50 shadow-2xl flex flex-col items-center justify-center font-black" 
                       style="width: ${size}px; height: ${size}px; background: linear-gradient(135deg, ${primaryColor}dd, ${primaryColor}aa); left: 50%; top: 50%; transform: translate(-50%, -50%);">
                    
                    <!-- Event count badge -->
                    <div class="text-center leading-none" style="color: ${isOfficial ? '#000' : '#fff'};">
                      <div class="text-lg font-black" style="font-size: ${size * 0.3}px; line-height: 1;">
                        ${eventCount}
                      </div>
                      <div class="text-[8px] uppercase tracking-wider opacity-70 mt-0.5" style="font-size: ${size * 0.12}px;">
                        ${eventCount === 1 ? 'event' : 'events'}
                      </div>
                    </div>
                    
                    <!-- Category diversity indicator (small dots) -->
                    ${categoryCount > 1 ? `
                      <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                        ${Array.from({ length: categoryCount }).map((_, i) => `
                          <div class="w-1 h-1 rounded-full bg-white/60" style="width: ${size * 0.08}px; height: ${size * 0.08}px;"></div>
                        `).join('')}
                      </div>
                    ` : ''}
                    
                    <!-- Official events indicator -->
                    ${officialCount > 0 ? `
                      <div class="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center shadow-lg" 
                           style="background: ${timeBasedColor}; width: ${size * 0.25}px; height: ${size * 0.25}px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="black" stroke="black" stroke-width="2.5">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                        </svg>
                      </div>
                    ` : ''}
                  </div>
                  
                  <!-- Hover tooltip preview -->
                  <div class="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20">
                    <div class="px-2 py-1 rounded-lg bg-black/90 backdrop-blur-sm border border-white/20 shadow-xl">
                      <p class="text-[8px] font-black uppercase tracking-widest text-white">
                        ${groupEvents[0]?.venueName || 'Multiple Events'}
                      </p>
                      <p class="text-[7px] font-medium opacity-60 text-white mt-0.5">
                        ${eventCount} ${eventCount === 1 ? 'event' : 'events'} • Tap to view
                      </p>
                    </div>
                  </div>
                </div>
              `;

              el.onclick = (e: MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                setSelectedCluster(group);
                setSelectedEventId(null);
                if (mapRef.current) {
                  mapRef.current.easeTo({ center: [location.lng, location.lat], zoom: 16 });
                }
              };
            } else {
              // Single event marker
              const event = groupEvents[0];
              if (!event) continue;
              
              let isLive = false;
              try {
                isLive = new Date(event.startAt).getTime() < Date.now() && new Date(event.endAt).getTime() > Date.now();
              } catch {
                isLive = false;
              }

              // Use time-based color
              const eventColor = getEventColor(event, theme);
              const isOfficial = event.tier === 'official';

              const markerSize = 32;
              const containerSize = markerSize + 30; // Add padding for blur effects

              el.innerHTML = `
                <div class="relative flex items-center justify-center group cursor-pointer" style="width: ${containerSize}px; height: ${containerSize}px; padding: 15px; box-sizing: border-box;">
                  <div class="absolute rounded-full blur-lg opacity-40 transition-all duration-300 group-hover:opacity-100 group-hover:blur-xl" 
                       style="background: ${eventColor}; box-shadow: 0 0 ${markerSize * 1.5}px ${eventColor}60; width: ${markerSize}px; height: ${markerSize}px; left: 50%; top: 50%; transform: translate(-50%, -50%);"></div>
                  <div class="relative z-10 p-2 rounded-full border-2 border-white/10 transition-transform duration-300 group-hover:scale-110 shadow-2xl" 
                       style="background-color: ${eventColor}; width: ${markerSize}px; height: ${markerSize}px; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; align-items: center; justify-content: center;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" 
                         stroke="${isOfficial ? '#000' : theme.text}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                  </div>
                  ${isLive ? `<div class="absolute rounded-full animate-ping opacity-60" style="background-color: ${eventColor}; width: ${markerSize}px; height: ${markerSize}px; left: 50%; top: 50%; transform: translate(-50%, -50%);"></div>` : ''}
                </div>
              `;

              el.onclick = (e: MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                setSelectedEventId(event.id);
                setSelectedCluster(null);
                if (mapRef.current) {
                  mapRef.current.easeTo({ center: [event.lng, event.lat], zoom: 15 });
                }
              };
            }

            try {
              if (!mapRef.current) continue;
              
              const markerKey = isCluster ? `cluster_${location.lat}_${location.lng}` : groupEvents[0]?.id;
              if (!markerKey) continue;
              
              // Validate coordinates
              if (typeof location.lat !== 'number' || typeof location.lng !== 'number' || 
                  isNaN(location.lat) || isNaN(location.lng)) {
                console.warn('Invalid coordinates for marker:', location);
                return;
              }
              
              const marker = new mapboxgl.Marker(el)
                .setLngLat([location.lng, location.lat])
                .addTo(mapRef.current);
              markersRef.current[markerKey] = marker;
            } catch (e) {
              console.warn("Could not add marker to mapbox", e);
            }
          } catch (e) {
            console.warn("Error processing event group:", e);
          }
        }
        
        index = endIndex;
        if (index < eventGroups.length) {
          requestAnimationFrame(addMarkersBatch);
        }
      };
      
      // Start adding markers
      requestAnimationFrame(addMarkersBatch);
    } catch (error) {
      console.error('Error in marker creation useEffect:', error);
    }
    };

    // Wait for map to finish moving before updating markers
    // This prevents markers from appearing at wrong positions during map movement
    if (mapRef.current.isMoving()) {
      const checkMoving = () => {
        if (mapRef.current && !mapRef.current.isMoving()) {
          updateMarkers();
        } else if (mapRef.current) {
          requestAnimationFrame(checkMoving);
        }
      };
      requestAnimationFrame(checkMoving);
    } else {
      updateMarkers();
    }
  }, [eventGroups, theme.accent, theme.surfaceAlt, theme.text, mapError, mapLoaded, currentZoom]);

  return (
    <div className="relative h-[calc(100vh-160px-80px)] overflow-hidden" style={{ backgroundColor: theme.background }}>
      {/* Real Mapbox Container */}
      <div 
        ref={mapContainerRef} 
        className={`absolute inset-0 transition-opacity duration-1000 ${mapError ? 'opacity-0' : 'opacity-100'}`}
        style={{ 
          width: '100%', 
          height: '100%', 
          minHeight: '400px',
          zIndex: 0,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: mapError ? 'transparent' : theme.background
        }}
      />
      
      {/* Fallback View */}
      {mapError && (
        <SimulatedMap 
          events={cityEvents} 
          theme={theme} 
          onSelect={(id) => setSelectedEventId(id)} 
        />
      )}

      {/* Location Permission Prompt */}
      <AnimatePresence>
        {showPermissionPrompt && locationPermission === 'prompt' && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="absolute top-4 left-6 right-6 z-30 pointer-events-auto"
          >
            <Card className="p-4 !bg-black/95 !backdrop-blur-3xl !border-white/20 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/20 border border-blue-500/30">
                  <MapIcon size={18} color={theme.accent} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-black uppercase italic tracking-tighter mb-1 text-white">
                    Location Access
                  </h3>
                  <p className="text-[10px] font-medium opacity-70 text-white leading-relaxed mb-3">
                    Enable location to find events near you and get personalized recommendations.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={requestLocation}
                      disabled={locationPermission === 'checking'}
                      className="px-4 py-2 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-xl active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {locationPermission === 'checking' ? 'Requesting...' : 'Allow'}
                    </button>
                    <button
                      onClick={dismissPermissionPrompt}
                      className="px-4 py-2 bg-white/10 text-white text-[10px] font-black uppercase tracking-widest rounded-xl active:scale-95 transition-all border border-white/20"
                    >
                      Not Now
                    </button>
                  </div>
                </div>
                <button
                  onClick={dismissPermissionPrompt}
                  className="w-6 h-6 rounded-full bg-white/10 backdrop-blur-xl flex items-center justify-center border border-white/10 text-white active:scale-90 transition-all flex-shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay UI - Always visible regardless of map state */}
      <div className={`absolute ${showPermissionPrompt && locationPermission === 'prompt' ? 'top-32' : 'top-4'} left-6 right-6 flex gap-4 pointer-events-none z-20 transition-all duration-300`}>
        <div className="flex-1 relative">
          <div className="px-4 py-3 rounded-2xl bg-black/60 backdrop-blur-xl border flex items-center gap-3 pointer-events-auto shadow-2xl" style={{ borderColor: theme.border }}>
            <Search size={16} className={`opacity-40 ${isSearching ? 'animate-pulse' : ''}`} color="white" />
          <input 
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => searchQuery && searchResults.length > 0 && setShowSearchResults(true)}
            className="bg-transparent outline-none text-[10px] font-black uppercase tracking-widest w-full text-white placeholder:opacity-30" 
              placeholder="Search location..." 
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setShowSearchResults(false);
                  // Remove search marker
                  if ((markersRef.current as any).__searchLocation) {
                    (markersRef.current as any).__searchLocation.remove();
                    delete (markersRef.current as any).__searchLocation;
                  }
                  setSearchedLocation(null);
                }}
                className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <X size={12} color="white" />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          <AnimatePresence>
            {showSearchResults && searchResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 right-0 mt-2 rounded-2xl bg-black/95 backdrop-blur-3xl border border-white/20 shadow-2xl overflow-hidden pointer-events-auto z-30"
                style={{ borderColor: theme.border }}
              >
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => handleSelectLocation(result)}
                    className="w-full px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0 flex items-start gap-3 group"
                  >
                    <MapPin size={16} className="opacity-40 mt-0.5 flex-shrink-0" color="white" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white truncate">
                        {result.place_name.split(',')[0]}
                      </p>
                      <p className="text-[9px] font-medium opacity-60 text-white mt-0.5 truncate">
                        {result.place_name.split(',').slice(1).join(',').trim()}
                      </p>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button className="p-3.5 rounded-2xl bg-black/60 backdrop-blur-xl border pointer-events-auto active:scale-95 transition-all shadow-2xl" style={{ borderColor: theme.border }}>
          <Filter size={18} color="white" />
        </button>
      </div>

      <div className="absolute right-6 bottom-32 flex flex-col gap-3 z-20">
        <button 
          onClick={() => {
            if (!mapError && mapRef.current && activeCity.coordinates) {
              mapRef.current.flyTo({ center: [activeCity.coordinates.lng, activeCity.coordinates.lat], zoom: 12 });
            }
          }}
          className="p-4 rounded-2xl bg-black/70 backdrop-blur-2xl border active:scale-95 transition-all shadow-xl" 
          style={{ borderColor: theme.border }}
        >
          <Compass size={22} color={theme.accent} />
        </button>
        <button 
          onClick={() => {
            if (userLocation && mapRef.current && !mapError) {
              mapRef.current.flyTo({
                center: [userLocation.lng, userLocation.lat],
                zoom: 14,
                duration: 1500,
              });
            } else if (locationPermission === 'denied' || locationPermission === 'prompt') {
              setShowPermissionPrompt(true);
            } else {
              requestLocation();
            }
          }}
          className="p-4 rounded-2xl bg-black/70 backdrop-blur-2xl border active:scale-95 transition-all shadow-xl" 
          style={{ borderColor: theme.border }}
          title={userLocation ? "Center on your location" : "Find my location"}
        >
          <Navigation size={22} color={userLocation ? theme.accent : theme.text} />
        </button>
      </div>

      <AnimatePresence>
        {selectedCluster && (
          <motion.div 
            initial={{ y: 300, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 300, opacity: 0 }}
            className="absolute bottom-28 left-6 right-6 z-30 pointer-events-auto"
          >
            <Card className="p-4 !bg-black/95 !backdrop-blur-3xl !border-white/20 shadow-2xl max-h-[60vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <MapPin size={18} color={theme.accent} />
                  <h3 className="text-xs font-black uppercase italic tracking-tighter text-white">
                    {selectedCluster.events[0].venueName}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedCluster(null)}
                  className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  <X size={14} color="white" />
                </button>
              </div>
              <p className="text-[9px] font-medium opacity-60 text-white mb-4 uppercase tracking-widest">
                {selectedCluster.events.length} {selectedCluster.events.length === 1 ? 'Event' : 'Events'} at this location
              </p>
              <div className="space-y-3">
                {selectedCluster.events.map((event) => {
                  const isLive = new Date(event.startAt).getTime() < Date.now() && new Date(event.endAt).getTime() > Date.now();
                  return (
                    <Link
                      key={event.id}
                      to={`/event/${event.id}`}
                      onClick={() => {
                        setSelectedCluster(null);
                        setSelectedEventId(event.id);
                      }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5"
                    >
                      <img 
                        src={event.mediaUrls[0]} 
                        className="w-16 h-16 rounded-xl object-cover border border-white/10 flex-shrink-0" 
                        alt={event.title} 
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {event.tier === 'official' && <Badge label="Official" type="official" />}
                          {isLive && <Badge label="Live" type="live" />}
                        </div>
                        <h4 className="text-[10px] font-black uppercase italic tracking-tight text-white truncate mb-1">
                          {event.title}
                        </h4>
                        <p className="text-[9px] font-medium opacity-60 text-white">
                          {new Date(event.startAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedEvent && !selectedCluster && (
          <motion.div 
            initial={{ y: 300, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 300, opacity: 0 }}
            className="absolute bottom-28 left-6 right-6 z-50"
          >
            <Card className="flex items-center gap-4 p-4 !bg-black/90 !backdrop-blur-3xl !border-white/10 relative shadow-2xl">
              <Link to={`/event/${selectedEvent.id}`} className="flex items-center gap-4 flex-1 overflow-hidden">
                <img src={selectedEvent.mediaUrls[0]} className="w-20 h-20 rounded-[1.8rem] object-cover border border-white/10" alt="" />
                <div className="flex-1 min-w-0">
                  <div className="flex gap-1.5 mb-2 overflow-hidden">
                    {selectedEvent.tier === 'official' && <Badge label="Official" type="official" />}
                    {new Date(selectedEvent.startAt).getTime() < Date.now() && <Badge label="Live" type="live" />}
                  </div>
                  <h4 className="font-black text-sm uppercase italic tracking-tighter truncate leading-tight text-white">
                    {selectedEvent.title}
                  </h4>
                  <div className="flex items-center gap-2 mt-1 opacity-50 text-[9px] font-black uppercase tracking-widest text-white truncate">
                    <MapPin size={10} />
                    {selectedEvent.venueName}
                  </div>
                </div>
              </Link>
              <button 
                onClick={(e) => { e.preventDefault(); setSelectedEventId(null); }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/10 backdrop-blur-xl flex items-center justify-center border border-white/10 text-white active:scale-90 transition-all"
              >
                <X size={14} />
              </button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
