// components/PlaceAutocomplete.tsx
'use client';

import React, { useState, useEffect } from 'react';

interface Suggestion {
  placePrediction: {
    placeId: string;
    text: {
      text: string;
    };
  };
}

// ✨ 1. centerLocation prop을 받도록 인터페이스를 수정합니다.
interface PlaceAutocompleteProps {
  onPlaceSelect: (placeId: string) => void;
  styles: { [key: string]: React.CSSProperties };
  centerLocation: { lat: number; lng: number }; 
}

// ✨ 2. props에서 centerLocation을 받아 사용합니다.
export default function PlaceAutocomplete({ onPlaceSelect, styles, centerLocation }: PlaceAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handler = setTimeout(async () => {
      if (query.length > 1) {
        setIsLoading(true);
        try {
          const response = await fetch('/api/autocomplete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              query,
              lat: centerLocation.lat,
              lng: centerLocation.lng 
            }),
          });
          const data = await response.json();
          if (response.ok) {
            setSuggestions(data.suggestions || []);
          } else {
            console.error('Failed to fetch suggestions:', data.error);
            setSuggestions([]);
          }
        } catch (error) {
          console.error('Error fetching suggestions:', error);
          setSuggestions([]);
        } finally {
          setIsLoading(false);
        }
      } else {
        setSuggestions([]);
      }
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [query, centerLocation]); 

  const handleSelect = (placeId: string) => {
    onPlaceSelect(placeId);
    setQuery('');
    setSuggestions([]);
  };

  const customStyles: { [key: string]: React.CSSProperties } = {
    suggestionList: { listStyle: 'none', padding: '0', margin: '5px 0 0 0', border: '1px solid #dee2e6', borderRadius: '8px', overflow: 'hidden', position: 'absolute', background: 'white', width: 'calc(100% - 30px)', zIndex: 10 },
    suggestionItem: { padding: '12px', cursor: 'pointer', borderBottom: '1px solid #e9ecef' },
    suggestionItemHover: { backgroundColor: '#f8f9fa' },
  };

  return (
    <div style={styles.autocompleteContainer}>
      <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="추가할 장소를 검색하세요..." style={styles.autocompleteInput} disabled={isLoading} />
      {isLoading ? <p style={{ fontSize: '14px', color: '#6c757d', margin: '5px 0 0 0' }}>검색 중...</p> : null}
      {suggestions.length > 0 && (
        <ul style={customStyles.suggestionList}>
          {suggestions.map((suggestion) => (
            <li key={suggestion.placePrediction.placeId} style={customStyles.suggestionItem} onClick={() => handleSelect(suggestion.placePrediction.placeId)} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = customStyles.suggestionItemHover.backgroundColor as string)} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
              {suggestion.placePrediction.text.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}