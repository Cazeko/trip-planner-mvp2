// app/api/autocomplete/route.ts

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { query, lat, lng } = await req.json();

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    if (!GOOGLE_MAPS_API_KEY) {
      console.error("[API Error] Google Maps Server API Key is missing.");
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    
    const url = 'https://places.googleapis.com/v1/places:autocomplete';
    
    const body: any = {
      input: query,
      languageCode: 'ko', // 언어는 한국어로 고정
      // ✨✨✨ 이 부분을 삭제하여 한국 외 지역도 검색 가능하도록 합니다!
      // includedRegionCodes: ['kr'] 
    };

    if (lat && lng) {
      body.locationBias = {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 50000.0 // 50km 반경
        }
      };
    }
    
    const headers = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
    };

    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: headers,
    });
    
    const data = await response.json();

    if (!response.ok) {
      console.error(`[Google Autocomplete API] Error for query "${query}":`, data);
      return NextResponse.json({ error: 'Failed to fetch autocomplete suggestions' }, { status: response.status });
    }

    return NextResponse.json(data, { status: 200 });

  } catch (error: any) {    
    console.error("[API Route Error] /api/autocomplete:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}