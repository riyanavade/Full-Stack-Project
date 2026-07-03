import React, { useState, useEffect, useRef, useCallback } from 'react';

const LocationPicker = ({ onPickupChange, onDropoffChange, pickup, dropoff }) => {
  const [pickupQuery, setPickupQuery] = useState(pickup?.address || '');
  const [dropoffQuery, setDropoffQuery] = useState(dropoff?.address || '');
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState([]);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [error, setError] = useState('');

  const pickupTimerRef = useRef(null);
  const dropoffTimerRef = useRef(null);

  // Sync external prop changes to local input values
  useEffect(() => {
    if (pickup?.address && pickup.address !== pickupQuery) {
      setPickupQuery(pickup.address);
    }
  }, [pickup?.address]);

  useEffect(() => {
    if (dropoff?.address && dropoff.address !== dropoffQuery) {
      setDropoffQuery(dropoff.address);
    }
  }, [dropoff?.address]);

  // Debounced address search via Nominatim
  const searchAddress = useCallback(async (query, setSuggestions) => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=in`,
        {
          headers: {
            'Accept': 'application/json',
          },
          referrerPolicy: 'no-referrer',
        }
      );
      if (!res.ok) {
        throw new Error(`Address search failed: ${res.status}`);
      }
      const data = await res.json();
      setSuggestions(data);
    } catch (err) {
      console.error('Location search error:', err);
      setError('Failed to search addresses');
      setSuggestions([]);
    }
  }, []);

  const handlePickupInput = (value) => {
    setPickupQuery(value);
    setError('');
    if (pickupTimerRef.current) clearTimeout(pickupTimerRef.current);
    pickupTimerRef.current = setTimeout(() => {
      searchAddress(value, setPickupSuggestions);
    }, 500);
  };

  const handleDropoffInput = (value) => {
    setDropoffQuery(value);
    setError('');
    if (dropoffTimerRef.current) clearTimeout(dropoffTimerRef.current);
    dropoffTimerRef.current = setTimeout(() => {
      searchAddress(value, setDropoffSuggestions);
    }, 500);
  };

  const handlePickupSelect = (result) => {
    const location = {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      address: result.display_name,
    };
    setPickupQuery(result.display_name);
    setPickupSuggestions([]);
    onPickupChange(location);
  };

  const handleDropoffSelect = (result) => {
    const location = {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      address: result.display_name,
    };
    setDropoffQuery(result.display_name);
    setDropoffSuggestions([]);
    onDropoffChange(location);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setGpsLoading(true);
    setError('');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
          );
          const data = await res.json();
          const address = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          setPickupQuery(address);
          onPickupChange({ lat, lng, address });
        } catch {
          setError('Failed to get address from coordinates');
          const address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          setPickupQuery(address);
          onPickupChange({ lat, lng, address });
        } finally {
          setGpsLoading(false);
        }
      },
      (err) => {
        setGpsLoading(false);
        setError(`GPS Error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (pickupTimerRef.current) clearTimeout(pickupTimerRef.current);
      if (dropoffTimerRef.current) clearTimeout(dropoffTimerRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Pickup Location */}
      <div className="relative">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium text-gray-300">Pickup Location</label>
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={gpsLoading}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
          >
            {gpsLoading ? (
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <line x1="12" y1="1" x2="12" y2="4" />
                <line x1="12" y1="20" x2="12" y2="23" />
                <line x1="1" y1="12" x2="4" y2="12" />
                <line x1="20" y1="12" x2="23" y2="12" />
              </svg>
            )}
            Use My Location
          </button>
        </div>
        <input
          type="text"
          value={pickupQuery}
          onChange={(e) => handlePickupInput(e.target.value)}
          placeholder="Search pickup address..."
          className="w-full p-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:border-blue-500 focus:outline-none text-white placeholder-gray-400 transition-all"
        />
        {pickupSuggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-gray-700 rounded-lg border border-gray-600 shadow-xl max-h-60 overflow-y-auto">
            {pickupSuggestions.map((result, index) => (
              <div
                key={`pickup-${index}`}
                onClick={() => handlePickupSelect(result)}
                className="px-4 py-3 hover:bg-gray-600 cursor-pointer text-sm text-gray-200 border-b border-gray-600/50 last:border-b-0"
              >
                {result.display_name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Destination */}
      <div className="relative">
        <label className="block text-sm font-medium text-gray-300 mb-1.5">Destination</label>
        <input
          type="text"
          value={dropoffQuery}
          onChange={(e) => handleDropoffInput(e.target.value)}
          placeholder="Search destination address..."
          className="w-full p-3 rounded-lg bg-gray-700/50 border border-gray-600 focus:border-blue-500 focus:outline-none text-white placeholder-gray-400 transition-all"
        />
        {dropoffSuggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-gray-700 rounded-lg border border-gray-600 shadow-xl max-h-60 overflow-y-auto">
            {dropoffSuggestions.map((result, index) => (
              <div
                key={`dropoff-${index}`}
                onClick={() => handleDropoffSelect(result)}
                className="px-4 py-3 hover:bg-gray-600 cursor-pointer text-sm text-gray-200 border-b border-gray-600/50 last:border-b-0"
              >
                {result.display_name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <p className="text-xs text-red-400 mt-1">{error}</p>
      )}
    </div>
  );
};

export default LocationPicker;
