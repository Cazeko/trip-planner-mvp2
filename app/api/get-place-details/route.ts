// app/api/get-place-details/route.ts

import { NextRequest, NextResponse } from 'next/server';

// Places API 응답에 대한 타입 정의
interface PlaceDetails {
  id: string;
  // displayName의 경우, 반환되는 텍스트와 언어 코드를 모두 포함할 수 있습니다.
  displayName?: {
    text: string;
    languageCode: string;
  };
  location?: {
    latitude: number;
    longitude: number;
  };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
  };
}

export async function POST(req: NextRequest) {
  try {
    const { placeId } = await req.json();

    if (!placeId) {
      return NextResponse.json({ error: 'Place ID is required' }, { status: 400 });
    }

    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    if (!GOOGLE_MAPS_API_KEY) {
      console.error("[API Error] Google Maps Server API Key is missing.");
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    
    // ✨ 핵심: URL에 languageCode=ko 쿼리 파라미터를 추가하여 한국어 정보를 명시적으로 요청합니다.
    const url = `https://places.googleapis.com/v1/places/${placeId}?languageCode=ko`;
    
    const headers = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      // 요청할 필드 목록을 명시합니다.
      'X-Goog-FieldMask': 'id,displayName,location,formattedAddress,internationalPhoneNumber,websiteUri,rating,regularOpeningHours,reviews'
    };

    const response = await fetch(url, { headers });
    const data: PlaceDetails = await response.json();

    if (!response.ok) {
      console.error(`[Google Places API] Error for placeId "${placeId}":`, data);
      return NextResponse.json({ error: 'Failed to fetch place details' }, { status: response.status });
    }
    
    // 프론트엔드에서 사용하기 좋은 최종 형태로 데이터를 가공합니다.
    const result = {
      // displayName.text가 존재하면 사용하고, 없으면 '이름 없는 장소'로 처리합니다.
      place: data.displayName?.text || '이름 없는 장소',
      latitude: data.location?.latitude,
      longitude: data.location?.longitude,
      formattedAddress: data.formattedAddress,
      internationalPhoneNumber: data.internationalPhoneNumber,
      websiteUri: data.websiteUri,
      rating: data.rating,
      regularOpeningHours: data.regularOpeningHours,
      reviews: (data as any).reviews,
    };

    return NextResponse.json(result, { status: 200 });

  } catch (error: any) {
    console.error("[API Route Error] /api/get-place-details:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}