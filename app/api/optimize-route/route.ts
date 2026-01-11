// app/api/optimize-route/route.ts

import { NextRequest, NextResponse } from 'next/server';
import type { ItineraryItem } from '../../../types/trip';

interface GoogleRoutesApiResponse {
  routes?: {
    optimizedIntermediateWaypointIndex?: number[];
  }[];
}

export async function POST(req: NextRequest) {
  let itinerary: ItineraryItem[] = [];
  try {
    const bodyJson = await req.json();
    itinerary = bodyJson?.itinerary as ItineraryItem[];
    const travelMode = bodyJson?.travelMode as any;

    console.log('[Optimize Route] Received travelMode:', travelMode, 'Type:', typeof travelMode, 'Is Array:', Array.isArray(travelMode));

    if (!itinerary || itinerary.length < 2) {
      return NextResponse.json(itinerary);
    }
    
    // travelMode가 배열로 전달된 경우 첫 번째 값을 사용
    const normalizedTravelMode = Array.isArray(travelMode) ? travelMode[0] : travelMode;
    
    // 대중교통은 API에서 지원하지 않으므로, 요청 자체를 보내지 않고 원본을 반환합니다.
    if (normalizedTravelMode === 'TRANSIT') {
      console.log("[API Info] Transit mode does not support optimization. Returning original itinerary.");
      return NextResponse.json(itinerary, { status: 200 });
    }

    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    if (!GOOGLE_MAPS_API_KEY) {
      console.warn("[Optimize Route] Google Maps Server API Key is missing. Returning original itinerary.");
      return NextResponse.json(itinerary, { status: 200 });
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
      travelMode: normalizedTravelMode || 'DRIVE',
      optimizeWaypointOrder: true,
    };
    
    // travelMode가 'DRIVE'일 때만 routingPreference를 추가합니다.
    if (normalizedTravelMode === 'DRIVE') {
        body.routingPreference = 'TRAFFIC_AWARE';
    }

    console.log('[Optimize Route] Sending body.travelMode:', body.travelMode);

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
        let errorData: any = undefined;
        try {
          errorData = await response.json();
        } catch {
          // ignore
        }
        console.warn("[Optimize Route] Google Routes API HTTP Error. Returning original itinerary.", {
          status: response.status,
          error: errorData,
        });
        return NextResponse.json(itinerary, { status: 200 });
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
    console.warn("[Optimize Route] Route handler error. Returning original itinerary.", error?.message);
    return NextResponse.json(itinerary, { status: 200 });
  }
}