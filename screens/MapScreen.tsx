
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Search, Filter, Navigation, Compass, X, AlertCircle, Zap, Map as MapIcon } from 'lucide-react';
import { Badge, Card } from '../components/UI';
import { Link } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import { Event } from '../types';

const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_ACCESS_TOKEN || 'pk.eyJ1Ijoiam9zaHVhcm9hZGVyIiwiYSI6ImNta2l4MzduaTEyYzkzZXEzdHY5dmlxdDEifQ.Ch-Yoo2bvEGrdcr3ph_MaQ';

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
              backgroundColor: isOfficial ? theme.accent : theme.surfaceAlt,
              borderColor: isOfficial ? '#FFF' : theme.border,
              boxShadow: isOfficial ? `0 0 30px ${theme.accent}` : `0 0 10px rgba(0,0,0,0.5)`
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
      return events.filter(e => e && e.cityId === activeCity.id);
    } catch (e) {
      console.error('Error filtering city events:', e);
      return [];
    }
  }, [events, activeCity.id]);
  
  const selectedEvent = events.find(e => e.id === selectedEventId);
  const [selectedCluster, setSelectedCluster] = useState<{ location: { lat: number; lng: number }; events: Event[] } | null>(null);

  // Group events by location (events within ~20 meters are considered same location)
  const groupEventsByLocation = (events: Event[]) => {
    try {
      if (!events || events.length === 0) return [];
      
      const groups: Map<string, Event[]> = new Map();
      const LOCATION_THRESHOLD = 0.00018; // ~20 meters in degrees

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

              if (distance < LOCATION_THRESHOLD) {
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

  const eventGroups = useMemo(() => groupEventsByLocation(cityEvents), [cityEvents]);

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
              if (error.code === error.PERMISSION_DENIED) {
                setLocationPermission('denied');
                setShowPermissionPrompt(false);
              } else {
                // Other errors (timeout, etc.) - show prompt
                setLocationPermission('prompt');
                setShowPermissionPrompt(true);
              }
            },
            { timeout: 100, maximumAge: 0 }
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
    if (!navigator.geolocation) return;

    setLocationPermission('checking');
    setShowPermissionPrompt(false);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        setLocationPermission('granted');

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
        console.error('Error getting location:', error);
        if (error.code === error.PERMISSION_DENIED) {
          setLocationPermission('denied');
        } else {
          setLocationPermission('prompt');
          setShowPermissionPrompt(true);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
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
      
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
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
        // Ensure map is visible after load
        if (mapContainerRef.current) {
          mapContainerRef.current.style.opacity = '1';
        }
      });

      map.on('style.load', () => {
        console.log("Mapbox style loaded");
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
    if (!mapRef.current || mapError) return;

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

      eventGroups.forEach(group => {
        try {
          if (!group || !group.location || !group.events || group.events.length === 0) return;
          
          const { location, events: groupEvents } = group;
          const isCluster = groupEvents.length > 1;

      const el = document.createElement('div');
      el.className = 'custom-marker';
      
          // For clusters, use the most prominent event for styling
          const primaryEvent = groupEvents.find(e => e.tier === 'official') || groupEvents[0];
          if (!primaryEvent) return;
          
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
            // Cluster marker with count
            el.innerHTML = `
              <div class="relative flex items-center justify-center group cursor-pointer">
                <div class="absolute inset-0 rounded-full blur-md opacity-40 transition-all duration-300 group-hover:opacity-100" 
                     style="background: ${isOfficial ? theme.accent : '#666'}"></div>
                <div class="relative z-10 w-12 h-12 rounded-full border-2 border-white/20 transition-transform duration-300 group-hover:scale-110 shadow-2xl flex items-center justify-center font-black text-xs" 
                     style="background-color: ${isOfficial ? theme.accent : theme.surfaceAlt}; color: ${isOfficial ? '#000' : theme.text}">
                  ${groupEvents.length}
                </div>
                ${hasLiveEvent ? `<div class="absolute inset-0 rounded-full animate-ping opacity-60" style="background-color: ${theme.accent}"></div>` : ''}
              </div>
            `;

            el.onclick = (e) => {
              e.stopPropagation();
              setSelectedCluster(group);
              setSelectedEventId(null);
              mapRef.current?.easeTo({ center: [location.lng, location.lat], zoom: 16 });
            };
          } else {
            // Single event marker
            const event = groupEvents[0];
            if (!event) return;
            
            let isLive = false;
            try {
              isLive = new Date(event.startAt).getTime() < Date.now() && new Date(event.endAt).getTime() > Date.now();
            } catch {
              isLive = false;
            }

      el.innerHTML = `
        <div class="relative flex items-center justify-center w-10 h-10 group cursor-pointer">
          <div class="absolute inset-0 rounded-full blur-md opacity-40 transition-all duration-300 group-hover:opacity-100" 
               style="background: ${isOfficial ? theme.accent : '#666'}"></div>
          <div class="relative z-10 p-2 rounded-full border-2 border-white/10 transition-transform duration-300 group-hover:scale-110 shadow-2xl" 
               style="background-color: ${isOfficial ? theme.accent : theme.surfaceAlt}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" 
                 stroke="${isOfficial ? '#000' : theme.text}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          </div>
          ${isLive ? `<div class="absolute inset-0 rounded-full animate-ping opacity-60" style="background-color: ${theme.accent}"></div>` : ''}
        </div>
      `;

      el.onclick = () => {
        setSelectedEventId(event.id);
              setSelectedCluster(null);
              mapRef.current?.easeTo({ center: [event.lng, event.lat], zoom: 15 });
            };
          }

          try {
            if (!mapRef.current) return;
            
            const markerKey = isCluster ? `cluster_${location.lat}_${location.lng}` : groupEvents[0]?.id;
            if (!markerKey) return;
            
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
    });
    } catch (error) {
      console.error('Error in marker creation useEffect:', error);
    }
  }, [eventGroups, theme.accent, theme.surfaceAlt, theme.text, mapError]);

  return (
    <div className="relative h-[calc(100vh-160px)] overflow-hidden" style={{ backgroundColor: theme.background }}>
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
            className="absolute bottom-24 left-6 right-6 z-30 pointer-events-auto"
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
            className="absolute bottom-6 left-6 right-6 z-50"
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
