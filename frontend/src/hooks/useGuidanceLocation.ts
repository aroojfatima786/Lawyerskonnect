import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'lk-guidance-city';

const PK_CITIES: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Karachi', lat: 24.8607, lng: 67.0011 },
  { name: 'Lahore', lat: 31.5204, lng: 74.3587 },
  { name: 'Islamabad', lat: 33.6844, lng: 73.0479 },
  { name: 'Rawalpindi', lat: 33.5651, lng: 73.0169 },
  { name: 'Faisalabad', lat: 31.4504, lng: 73.135 },
  { name: 'Multan', lat: 30.1575, lng: 71.5249 },
  { name: 'Peshawar', lat: 34.0151, lng: 71.5249 },
  { name: 'Quetta', lat: 30.1798, lng: 66.975 },
  { name: 'Sialkot', lat: 32.4945, lng: 74.5229 },
  { name: 'Gujranwala', lat: 32.1877, lng: 74.1945 },
  { name: 'Hyderabad', lat: 25.396, lng: 68.3578 },
  { name: 'Abbottabad', lat: 34.1688, lng: 73.2215 },
];

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestPakistanCity(lat: number, lng: number): string {
  let best = PK_CITIES[0];
  let bestKm = Infinity;
  for (const city of PK_CITIES) {
    const km = haversineKm(lat, lng, city.lat, city.lng);
    if (km < bestKm) {
      bestKm = km;
      best = city;
    }
  }
  return bestKm <= 120 ? best.name : '';
}

export type GuidanceCoords = { latitude: number; longitude: number };

export function useGuidanceLocation(profileCity?: string) {
  const [city, setCity] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || profileCity || '';
    } catch {
      return profileCity || '';
    }
  });
  const [coords, setCoords] = useState<GuidanceCoords | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    if (profileCity?.trim() && !city.trim()) {
      setCity(profileCity.trim());
    }
  }, [profileCity, city]);

  useEffect(() => {
    try {
      if (city.trim()) localStorage.setItem(STORAGE_KEY, city.trim());
    } catch {
      /* private mode */
    }
  }, [city]);

  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Location is not supported in this browser.');
      return;
    }
    setDetecting(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        setCoords({ latitude, longitude });
        const guessed = nearestPakistanCity(latitude, longitude);
        if (guessed) setCity(guessed);
        setDetecting(false);
      },
      () => {
        setLocationError('Location access denied. Enter your city manually or allow location in browser settings.');
        setDetecting(false);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  }, []);

  return { city, setCity, coords, detecting, locationError, detectLocation, setLocationError };
}
