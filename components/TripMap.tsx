// components/TripMap.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Map, AdvancedMarker, Pin, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import type { Day, ItineraryItem } from '../types/trip';

interface TripMapProps {
  days: Day[];
  selectedDay?: number | null;
}

const polylineColors = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#FFC300'];

const MapFeatures = ({ days }: { days: Day[] }) => {
  const map = useMap();
  const [selectedPlace, setSelectedPlace] = useState<ItineraryItem | null>(null);

  useEffect(() => {
    if (!map) return;

    const allPolylines: google.maps.Polyline[] = [];

    const arrowIcon = {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 4,
        strokeColor: '#000',
        strokeWeight: 2
    };

    days.forEach((day, index) => {
      if (day.itinerary.length < 2) return;

      const path = day.itinerary.map(item => ({ lat: item.latitude, lng: item.longitude }));
      
      const polyline = new google.maps.Polyline({
        path: path,
        strokeColor: polylineColors[index % polylineColors.length],
        strokeOpacity: 0.9,
        strokeWeight: 5,
        icons: [{
            icon: arrowIcon,
            offset: '50%',
            repeat: '250px'
        }]
      });

      polyline.setMap(map);
      allPolylines.push(polyline);
    });

    return () => {
      allPolylines.forEach(polyline => {
        polyline.setMap(null);
      });
    };
  }, [map, days]); 

  const allItems = days.flatMap(day => day.itinerary);

  return (
    <>
      {allItems.map((item, index) => {
        const dayIndex = days.findIndex(d => d.itinerary.includes(item));
        const color = polylineColors[dayIndex % polylineColors.length];

        return (
          <AdvancedMarker
            key={`${item.place}-${item.time}-${index}`}
            position={{ lat: item.latitude, lng: item.longitude }}
            onClick={() => setSelectedPlace(item)}
          >
            <Pin
              background={color}
              borderColor={'#1E1E1E'}
              glyphColor={'#1E1E1E'}
            />
          </AdvancedMarker>
        );
      })}

      {selectedPlace && (
        <InfoWindow
          key={`${selectedPlace.place}-infowindow`}
          position={{ lat: selectedPlace.latitude, lng: selectedPlace.longitude }}
          onCloseClick={() => setSelectedPlace(null)}
          minWidth={250}
        >
          <div>
            <h4 style={{ margin: '0 0 5px 0' }}>{selectedPlace.place}</h4>
            <p style={{ margin: '2px 0' }}>⭐ {selectedPlace.rating || '평점 정보 없음'}</p>
            <p style={{ margin: '2px 0' }}>📍 {selectedPlace.formattedAddress || '주소 정보 없음'}</p>
            <p style={{ margin: '2px 0' }}>📞 {selectedPlace.internationalPhoneNumber || '전화번호 정보 없음'}</p>
            {selectedPlace.websiteUri && (
              <p style={{ margin: '2px 0' }}>
                <a href={selectedPlace.websiteUri} target="_blank" rel="noopener noreferrer">웹사이트 방문</a>
              </p>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
};


export default function TripMap({ days, selectedDay = null }: TripMapProps) {
  const filteredDays = selectedDay === null ? days : days.filter(d => d.day === selectedDay);
  const allItems = filteredDays.flatMap(day => day.itinerary);
  const position = allItems.length > 0 ? { lat: allItems[0].latitude, lng: allItems[0].longitude } : { lat: 37.5665, lng: 126.9780 };

  const legendStyles: React.CSSProperties = {
    position: 'absolute',
    bottom: '10px',
    left: '10px',
    background: 'rgba(255, 255, 255, 0.9)',
    padding: '10px',
    borderRadius: '8px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
    zIndex: 2,
    fontFamily: 'sans-serif',
    fontSize: '14px',
  };

  const legendItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '5px',
  };

  const colorBoxStyle = (color: string): React.CSSProperties => ({
    width: '15px',
    height: '15px',
    backgroundColor: color,
    marginRight: '8px',
    border: '1px solid #ccc',
  });

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', borderRadius: '8px', overflow: 'hidden' }}>
       <div style={legendStyles}>
         <h4 style={{margin: '0 0 10px 0'}}>경로 안내</h4>
         {filteredDays.map((day, index) => (
           <div key={day.day} style={legendItemStyle}>
             <span style={colorBoxStyle(polylineColors[index % polylineColors.length])}></span>
             Day {day.day}
           </div>
         ))}
       </div>
      <Map
        defaultCenter={position}
        defaultZoom={12}
        mapId="a0e_91f6ab0e890f8"
        gestureHandling={'greedy'}
        key={(filteredDays.length ? filteredDays : days).map(d => d.day).join('-')}
      >
        <MapFeatures days={filteredDays} />
      </Map>
    </div>
  );
}