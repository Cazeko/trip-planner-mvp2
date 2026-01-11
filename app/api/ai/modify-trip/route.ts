import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { TripData, Day, ItineraryItem } from '../../../../types/trip';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getPlaceDetails(placeName: string, lat: number, lng: number) {
  const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!GOOGLE_MAPS_API_KEY) return null;

  const url = 'https://places.googleapis.com/v1/places:searchText';
  const body = {
    textQuery: placeName,
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 5000.0
      }
    },
    languageCode: 'ko'
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.reviews,places.regularOpeningHours,places.internationalPhoneNumber,places.websiteUri,places.photos'
      }
    });
    const data = await res.json();
    return data.places && data.places.length > 0 ? data.places[0] : null;
  } catch (e) {
    console.error("Google Places Search Error:", e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { trip, messages } = await req.json();
    const lastMessage = messages[messages.length - 1]?.content || "";

    if (!trip) {
      return NextResponse.json({ error: "Trip data is missing" }, { status: 400 });
    }

    // 1. OpenAI로 의도 파악
    const systemPrompt = `
      You are a travel assistant modifying a trip itinerary.
      Analyze the user's request and extract the necessary information to modify the trip.
      
      Current Trip Context:
      - Title: ${trip.tripTitle}
      - Destination: ${trip.destination}
      - Days: ${trip.days.length} days

      User Request: "${lastMessage}"

      Output JSON format:
      {
        "dayIndex": number, // 0-based index. If not specified, default to 0.
        "searchQuery": string, // The place name to search for (e.g., "이치란 라멘", "오사카 성"). If generic (e.g. "Ramen"), add "famous" or "recommendation".
        "time": string, // HH:MM format. Infer from "lunch" (12:00), "dinner" (18:00), etc. Default to "12:00".
        "reason": string, // Why this place is added (in Korean).
        "category": string // "식사", "관광", "카페", "숙소", "기타"
      }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }],
      response_format: { type: "json_object" },
    });

    const intent = JSON.parse(completion.choices[0].message.content || "{}");
    const dayIdx = intent.dayIndex ?? 0;
    const targetDay = trip.days[dayIdx] || trip.days[0];
    
    // 기준 좌표 설정 (동선 최적화: 직전/직후 장소 기준)
    let lat = 35.0, lng = 135.0;
    
    if (targetDay && targetDay.itinerary.length > 0) {
      // 1. 시간순 정렬
      const sortedItinerary = [...targetDay.itinerary].sort((a, b) => a.time.localeCompare(b.time));
      const targetTime = intent.time || "12:00";

      // 2. 삽입 위치의 직전/직후 장소 찾기
      let prevItem = null;
      let nextItem = null;

      for (const item of sortedItinerary) {
        if (item.time <= targetTime) {
          prevItem = item;
        } else {
          nextItem = item;
          break; // 첫 번째로 큰 시간이 nextItem
        }
      }

      // 3. 좌표 결정 우선순위: 직전 장소 > 직후 장소 > 해당 일차 첫 장소
      if (prevItem) {
        lat = prevItem.latitude;
        lng = prevItem.longitude;
      } else if (nextItem) {
        lat = nextItem.latitude;
        lng = nextItem.longitude;
      } else {
        lat = sortedItinerary[0].latitude;
        lng = sortedItinerary[0].longitude;
      }
    } else if (trip.days.length > 0) {
       // 해당 일차에 아무것도 없으면 다른 날짜의 좌표라도 참고
       const anyDay = trip.days.find((d: Day) => d.itinerary.length > 0);
       if (anyDay && anyDay.itinerary.length > 0) {
         lat = anyDay.itinerary[0].latitude;
         lng = anyDay.itinerary[0].longitude;
       }
    }

    // 2. Google Places 검색
    const placeData = await getPlaceDetails(intent.searchQuery, lat, lng);
    
    // 3. 새 아이템 생성
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_SERVER_API_KEY || '';
    const photoUrl = placeData?.photos && placeData.photos.length > 0 && placeData.photos[0].name
      ? `https://places.googleapis.com/v1/${encodeURIComponent(placeData.photos[0].name)}/media?maxWidthPx=400&key=${GOOGLE_MAPS_API_KEY}`
      : null;

    const newItem: ItineraryItem = {
      time: intent.time || "12:00",
      place: placeData?.displayName?.text || intent.searchQuery,
      description: `${intent.reason} (카테고리: ${intent.category})`,
      reason: intent.reason,
      latitude: placeData?.location?.latitude || lat,
      longitude: placeData?.location?.longitude || lng,
      formattedAddress: placeData?.formattedAddress,
      internationalPhoneNumber: placeData?.internationalPhoneNumber,
      websiteUri: placeData?.websiteUri,
      rating: placeData?.rating,
      reviews: placeData?.reviews,
      regularOpeningHours: placeData?.regularOpeningHours,
      photoUrl: photoUrl || undefined,
    };

    // 4. Trip 업데이트
    const newDays = [...trip.days];
    if (!newDays[dayIdx]) {
        // 만약 해당 일차가 없다면 생성 (예외 처리)
        newDays[dayIdx] = { day: dayIdx + 1, itinerary: [] };
    }
    
    // 시간순 정렬을 위해 기존 일정과 합침
    const updatedItinerary = [...newDays[dayIdx].itinerary, newItem].sort((a, b) => {
      return a.time.localeCompare(b.time);
    });

    newDays[dayIdx] = {
      ...newDays[dayIdx],
      itinerary: updatedItinerary
    };

    const updatedTrip: TripData = {
      ...trip,
      days: newDays
    };

    return NextResponse.json({
      reply: `${dayIdx + 1}일차에 '${newItem.place}'를 추가했어요. (${intent.time})`,
      trip: updatedTrip,
      ready: true
    });

  } catch (error: any) {
    console.error("[Modify Trip Error]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
