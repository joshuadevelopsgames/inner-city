/**
 * Geocoding service for city detection and search
 * Uses Mapbox Geocoding API for reverse geocoding and city search
 */

const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_ACCESS_TOKEN || 'pk.eyJ1Ijoiam9zaHVhcm9hZGVyIiwiYSI6ImNta2l4MzduaTEyYzkzZXEzdHY5dmlxdDEifQ.Ch-Yoo2bvEGrdcr3ph_MaQ';

export interface GeocodingResult {
  id: string;
  name: string;
  country: string;
  coordinates: { lat: number; lng: number };
  placeName: string;
}

/**
 * Reverse geocode coordinates to find city
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodingResult | null> {
  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&types=place&limit=1`
    );
    
    if (!response.ok) {
      throw new Error('Geocoding request failed');
    }

    const data = await response.json();
    const feature = data.features?.[0];
    
    if (!feature) {
      return null;
    }

    // Extract city name and country from context
    const context = feature.context || [];
    const place = feature.text || feature.place_name?.split(',')[0];
    const countryFeature = context.find((c: any) => c.id?.startsWith('country'));
    const country = countryFeature?.text || feature.place_name?.split(',').pop()?.trim() || 'Unknown';

    return {
      id: feature.id,
      name: place,
      country: country,
      coordinates: { lat, lng },
      placeName: feature.place_name || `${place}, ${country}`
    };
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return null;
  }
}

/**
 * Search for cities by name
 */
export async function searchCities(query: string, limit: number = 10): Promise<GeocodingResult[]> {
  if (!query.trim() || query.length < 2) {
    return [];
  }

  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&types=place&limit=${limit}`
    );
    
    if (!response.ok) {
      throw new Error('City search request failed');
    }

    const data = await response.json();
    
    return (data.features || []).map((feature: any) => {
      const context = feature.context || [];
      const place = feature.text || feature.place_name?.split(',')[0];
      const countryFeature = context.find((c: any) => c.id?.startsWith('country'));
      const country = countryFeature?.text || feature.place_name?.split(',').pop()?.trim() || 'Unknown';
      const [lng, lat] = feature.center;

      return {
        id: feature.id,
        name: place,
        country: country,
        coordinates: { lat, lng },
        placeName: feature.place_name || `${place}, ${country}`
      };
    });
  } catch (error) {
    console.error('Error searching cities:', error);
    return [];
  }
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find nearest city from a list of cities based on coordinates
 */
export function findNearestCity(
  lat: number,
  lng: number,
  cities: Array<{ coordinates?: { lat: number; lng: number }; name: string }>
): { city: typeof cities[0]; distance: number } | null {
  if (!cities || cities.length === 0) {
    return null;
  }

  let nearest: typeof cities[0] | null = null;
  let minDistance = Infinity;

  for (const city of cities) {
    if (!city.coordinates) continue;
    
    const distance = calculateDistance(
      lat,
      lng,
      city.coordinates.lat,
      city.coordinates.lng
    );

    if (distance < minDistance) {
      minDistance = distance;
      nearest = city;
    }
  }

  return nearest ? { city: nearest, distance: minDistance } : null;
}
