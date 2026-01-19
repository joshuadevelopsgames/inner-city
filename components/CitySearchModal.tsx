import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, MapPin, Check } from 'lucide-react';
import { City } from '../types';
import { searchCities, GeocodingResult } from '../services/geocoding';
import { MOCK_CITIES } from '../mockData';
import { useApp } from '../store';

interface CitySearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCity: (city: City) => void;
}

export const CitySearchModal: React.FC<CitySearchModalProps> = ({ isOpen, onClose, onSelectCity }) => {
  const { theme, activeCity } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTimeoutRef, setSearchTimeoutRef] = useState<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Search cities with debouncing
  useEffect(() => {
    if (searchTimeoutRef) {
      clearTimeout(searchTimeoutRef);
    }

    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const results = await searchCities(searchQuery, 10);
        setSearchResults(results);
      } catch (error) {
        console.error('Error searching cities:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    setSearchTimeoutRef(timeout);

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [searchQuery]);

  const handleSelectResult = async (result: GeocodingResult) => {
    // Check if this matches a known city
    const knownCity = MOCK_CITIES.find(
      city => city.name.toLowerCase() === result.name.toLowerCase() ||
             city.name.toLowerCase().includes(result.name.toLowerCase()) ||
             result.name.toLowerCase().includes(city.name.toLowerCase())
    );

    if (knownCity) {
      // Use the known city with all its metadata
      onSelectCity(knownCity);
    } else {
      // Create a new city object from the geocoding result
      const newCity: City = {
        id: result.id,
        name: result.name,
        country: result.country,
        timezone: 'UTC', // Default timezone, could be enhanced
        coordinates: result.coordinates,
      };
      onSelectCity(newCity);
    }
    onClose();
  };

  const handleSelectKnownCity = (city: City) => {
    onSelectCity(city);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-x-4 top-20 bottom-20 z-50 rounded-3xl overflow-hidden flex flex-col"
            style={{ backgroundColor: theme.background, border: `1px solid ${theme.border}` }}
          >
            {/* Header */}
            <div className="p-6 border-b" style={{ borderColor: theme.border }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-black italic tracking-tighter uppercase">Select City</h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-full hover:bg-white/5 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Search Input */}
              <div className="relative">
                <Search 
                  size={18} 
                  className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40"
                  style={{ color: theme.text }}
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for a city..."
                  className="w-full pl-12 pr-4 py-4 rounded-2xl outline-none text-sm font-medium"
                  style={{ 
                    backgroundColor: theme.surfaceAlt, 
                    color: theme.text, 
                    border: `1px solid ${theme.border}` 
                  }}
                />
                {isSearching && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.accent }} />
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {!searchQuery || searchQuery.length < 2 ? (
                // Show available cities when not searching
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-4">
                    Available Cities
                  </h3>
                  <div className="space-y-2">
                    {MOCK_CITIES.map((city) => (
                      <button
                        key={city.id}
                        onClick={() => handleSelectKnownCity(city)}
                        className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-white/5 transition-colors border"
                        style={{ 
                          borderColor: activeCity.id === city.id ? theme.accent : theme.border + '40',
                          backgroundColor: activeCity.id === city.id ? theme.accent + '10' : 'transparent'
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl" style={{ backgroundColor: theme.surfaceAlt }}>
                            <MapPin size={16} />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-black uppercase tracking-tight">{city.name}</p>
                            <p className="text-[10px] opacity-60 font-medium">{city.country}</p>
                          </div>
                        </div>
                        {activeCity.id === city.id && (
                          <Check size={18} style={{ color: theme.accent }} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : searchResults.length > 0 ? (
                // Show search results
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-4">
                    Search Results
                  </h3>
                  <div className="space-y-2">
                    {searchResults.map((result) => {
                      const isKnownCity = MOCK_CITIES.some(
                        city => city.name.toLowerCase() === result.name.toLowerCase()
                      );
                      
                      return (
                        <button
                          key={result.id}
                          onClick={() => handleSelectResult(result)}
                          className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-white/5 transition-colors border"
                          style={{ borderColor: theme.border + '40' }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl" style={{ backgroundColor: theme.surfaceAlt }}>
                              <MapPin size={16} />
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-black uppercase tracking-tight">{result.name}</p>
                              <p className="text-[10px] opacity-60 font-medium">{result.country}</p>
                            </div>
                          </div>
                          {isKnownCity && (
                            <span className="text-[8px] font-black uppercase px-2 py-1 rounded" style={{ backgroundColor: theme.accent + '20', color: theme.accent }}>
                              Available
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                // No results
                <div className="text-center py-12">
                  <p className="text-sm opacity-40 font-medium">No cities found</p>
                  <p className="text-[10px] opacity-20 mt-2">Try a different search term</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
