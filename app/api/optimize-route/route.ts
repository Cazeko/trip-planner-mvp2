// app/api/optimize-route/route.ts

import { NextRequest, NextResponse } from 'next/server';
import type { ItineraryItem } from '../../../types/trip';

interface GoogleRoutesApiResponse {
  routes?: {
    optimizedIntermediateWaypointIndex?: number[];
  }[];
}

export async function POST(req: NextRequest) {
  try {
    const { itinerary, travelMode }: { itinerary: ItineraryItem[], travelMode: string } = await req.json();

    if (!itinerary || itinerary.length < 2) {
      return NextResponse.json(itinerary);
    }
    
    // 대중교통은 API에서 지원하지 않으므로, 요청 자체를 보내지 않고 원본을 반환합니다.
    if (travelMode === 'TRANSIT') {
      console.log("[API Info] Transit mode does not support optimization. Returning original itinerary.");
      return NextResponse.json(itinerary, { status: 200 });
    }

    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    if (!GOOGLE_MAPS_API_KEY) {
      console.error("[API Error] Google Maps Server API Key is missing.");
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';

    const body: any = {
      origin: {
        location: {
          latLng: {
            latitude: itinerary[0].latitude,
            longitude: itinerary[0].longitude,
          }
        }
      },
      destination: {
        location: {
          latLng: {
            latitude: itinerary[0].latitude,
            longitude: itinerary[0].longitude,
          }
        }
      },
      intermediates: itinerary.slice(1).map(item => ({
        location: {
          latLng: {
            latitude: item.latitude,
            longitude: item.longitude
          }
        }
      })),
      travelMode: travelMode || 'DRIVE',
      optimizeWaypointOrder: true,
    };
    
    // travelMode가 'DRIVE'일 때만 routingPreference를 추가합니다.
    if (travelMode === 'DRIVE') {
        body.routingPreference = 'TRAFFIC_AWARE';
    }

    const headers = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex'
    };

    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: headers
    });
    
    if (!response.ok) {
        const errorData = await response.json();
        console.error("Google Routes API HTTP Error:", errorData);
        throw new Error(errorData.error?.message || 'Failed to fetch optimized route.');
    }
    
    const data: GoogleRoutesApiResponse = await response.json();
    
    if (!data.routes || data.routes.length === 0 || !data.routes[0].optimizedIntermediateWaypointIndex) {
      console.warn("[API Warning] No optimized route found. Returning original itinerary.");
      return NextResponse.json(itinerary, { status: 200 });
    }
    
    const waypointOrder = data.routes[0].optimizedIntermediateWaypointIndex;
    const remainingItinerary = itinerary.slice(1);
    const optimizedRemainingItinerary = waypointOrder.map((index) => remainingItinerary[index]);

    const optimizedItinerary = [
      itinerary[0],
      ...optimizedRemainingItinerary,
    ];

    return NextResponse.json(optimizedItinerary, { status: 200 });

  } catch (error: any) {
    console.error("[API Route Error] /api/optimize-route:", error.message);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}