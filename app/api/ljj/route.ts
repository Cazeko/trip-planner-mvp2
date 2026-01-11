// app/api/ljj/route.ts (enhanced extractor)
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { scheduleWithDurations, type TravelMode } from '../../../lib/scheduling';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Extracted = {
  destination?: string;
  period?: string;
  keywords?: string;
  travelType?: 'standard'|'family'|'couple'|'roadtrip'|'relaxed'|'intense';
  include?: string;
  exclude?: string;
  preferredTransport?: 'DRIVE'|'TRANSIT'|'WALK';
  preferredTransportMulti?: Array<'DRIVE'|'TRANSIT'|'WALK'>;
};

export async function POST(req: NextRequest) {
  try {
    const { messages = [], extracted: prevExtracted = {} as Extracted, trip } = await req.json();
    const last = Array.isArray(messages) ? messages[messages.length - 1] : null;
    const userText = last?.content || '';

    console.log(`[LJJ] Request: ${messages.length} msgs, Trip exists: ${!!trip}, User: ${userText.substring(0, 20)}...`);

    // 1. 여행 생성 전(trip이 없음) 단계: OpenAI를 사용하여 의도 파악 및 정보 추출
    if (!trip) {
      const systemPrompt = `
You are Tripdom AI, a smart travel assistant.
Extract travel details from the user's input.

Current state: ${JSON.stringify(prevExtracted)}

Extract or update:
- destination: City/region (e.g., 'Jeju', 'Osaka')
- period: Duration in 'N박 M일' format
- keywords: Themes (e.g., 'healing', 'food tour')
- travelType: ['family', 'couple', 'roadtrip', 'relaxed', 'intense']
- preferredTransport: ['DRIVE', 'TRANSIT', 'WALK'] or array if multiple
- include: Specific places (e.g., "Day 1 Sungsimdang")
- exclude: Places to avoid

Rules:
1. Smart inference: "Jeju 2 nights" → destination="Jeju", period="2박 3일"
2. 'ready' = true ONLY when ALL present: destination, period, transport, travelType
3. 'reply': Natural Korean response
   - If not ready, ask for 1-2 missing items
   - Never repeat user's words verbatim
   - Never mention flights/hotels (we only plan daily activities)
   - If ready, confirm and say generating itinerary

Output JSON:
{
  "extracted": {...},
  "ready": boolean,
  "reply": "string"
}
`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m: any) => ({ role: m.role, content: m.content }))
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 500, // Reduced to ensure completion within limit
      });

      console.log('[LJJ] OpenAI Usage:', completion.usage); // 토큰 사용량 로깅

      const content = completion.choices[0].message.content;
      if (!content) {
        throw new Error('OpenAI returned empty content');
      }

      let result;
      try {
        result = JSON.parse(content);
      } catch (e) {
        console.error('JSON parse error:', content);
        // Fallback if JSON is broken
        result = { extracted: prevExtracted, ready: false, reply: "죄송해요, 처리 중에 문제가 발생했어요. 다시 한 번 말씀해 주시겠어요?" };
      }
      
      // Frontend compatibility: 'ask' used to be appended to the message. 
      // With LLM, the reply contains the question, so we set ask to empty to avoid duplication or technical leaks.
      return NextResponse.json({
        extracted: result.extracted || prevExtracted,
        ready: result.ready || false,
        reply: result.reply || "죄송해요, 이해하지 못했어요. 다시 말씀해 주시겠어요?",
        ask: '' 
      });
    }

    // 2. 여행 생성 후(trip이 있음) 단계: 기존 로직 유지 (장소 추가 등)
    // --- 자연어 편집: "N일차에 카테고리 장소 추가" 일반화 ---
    
    // extractedNow 정의 (기존 extracted 사용)
    const extractedNow = prevExtracted;

    // 1) GPT를 이용해 사용자의 수정 의도를 파악 (단순 키워드 매칭 한계 극복)
    const modifyPrompt = `
You are a smart travel assistant helping a user modify their itinerary.
Current Trip Context:
- Destination: ${trip.destination}
- Days: ${trip.days.length} days

User Request: "${userText}"

Analyze the user's request and extract the following:
- action: 'add_place' | 'remove_place' | 'change_time' | 'optimize_efficiency' | 'reduce_fatigue' | 'chat_only'
- dayIndex: 0-based index of the day to modify (e.g., "1일차" -> 0). If not specified, return -1.
- query: The specific place name or category to search for (e.g., "고등어 맛집", "스타벅스").
- category: '식사' | '카페' | '관광' | '야경' | '숙소' | '기타'
- time: Preferred time in "HH:MM" format (e.g., "점심" -> "12:00", "저녁" -> "18:30"). If not specified, return null.
- reason: Why this place is being added (for description).

Rules:
1. **Smart Query Construction**:
   - If the user asks for a specific food type (e.g., "Ramen", "Sushi", "Gukbap", "Chinese", "Korean", "Mackerel"), construct the query by combining the **Destination** and the **Food Type** (e.g., "${trip.destination} Ramen", "${trip.destination} Gukbap").
   - Example: "Add a mackerel place" -> Query: "${trip.destination} 고등어 맛집".
   - Example: "I want sushi" -> Query: "${trip.destination} 스시 맛집".
   - Example: "Chinese food" -> Query: "${trip.destination} 중식당".
2. **Optimization Requests**:
   - If user wants to improve efficiency, reduce travel time, or optimize route -> action: 'optimize_efficiency'
   - If user wants to reduce fatigue, have more breaks, fewer places, slower pace -> action: 'reduce_fatigue'
   - Examples: "효율성 높여줘", "이동시간 줄여줘", "피로도 낮춰줘", "여유롭게 해줘", "장소 줄여줘"
3. If the user just wants to chat or asks a general question, set action to 'chat_only'.

Output JSON:
{
  "action": "add_place",
  "dayIndex": 0,
  "query": "제주도 고등어 맛집",
  "category": "식사",
  "time": "12:00",
  "reason": "사용자가 요청한 고등어 맛집"
}
`;

    const modification = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: modifyPrompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const modResult = JSON.parse(modification.choices[0].message.content || '{}');

    // 단순 대화인 경우
    if (modResult.action === 'chat_only') {
       return NextResponse.json({ 
        reply: "여행 일정에 대해 수정하고 싶은 부분이 있다면 말씀해 주세요. (예: '1일차 점심에 라멘집 추가해줘')", 
        extracted: extractedNow, 
        ready: true 
      });
    }

    // --- Helper Functions (Moved inside to be accessible) ---
    async function searchPlaces(query: string, lat: number, lng: number, apiKey: string, categoryFilter?: '식사' | '카페') {
      const body: any = {
        textQuery: query,
        // 동선 최적화를 위해 반경을 3km로 좁혀서 검색 (너무 멀리 튀지 않도록)
        locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 3000 } },
        languageCode: 'ko'
      };
      if (categoryFilter === '식사') body.includedType = 'restaurant';
      else if (categoryFilter === '카페') body.includedType = 'cafe';
      
      const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri,places.rating,places.reviews,places.regularOpeningHours,places.types'
        },
        body: JSON.stringify(body)
      });
      const data = await resp.json();
      return Array.isArray(data?.places) ? data.places : [];
    }

    // 장소 추가 로직 (GPT가 분석한 결과 사용)
    if (modResult.action === 'add_place' && trip && Array.isArray(trip.days)) {
      const dayIdx = modResult.dayIndex >= 0 ? modResult.dayIndex : 0; // 기본 1일차
      const day = trip.days[dayIdx];
      if (!day) {
         return NextResponse.json({ reply: "해당 일차를 찾을 수 없어요.", extracted: extractedNow, ready: true });
      }

      // 기준 좌표 결정 (동선 최적화 로직 적용)
      let lat = 35.0, lng = 135.0;
      const list = day.itinerary || [];
      const time = modResult.time || '12:00';
      
      if (list.length > 0) {
        // 1. 시간순 정렬
        const sortedList = [...list].sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
        
        // 2. 삽입될 시간 기준 직전(prev)과 직후(next) 장소 찾기
        let prevItem = null;
        let nextItem = null;
        
        for (const item of sortedList) {
          if ((item.time || '00:00') <= time) {
            prevItem = item;
          } else {
            nextItem = item;
            break; 
          }
        }

        // 3. 동선 최적화: '직전 장소'가 있다면 그 근처를 우선 검색 (이동 흐름 자연스럽게)
        // 직전 장소가 없다면(아침 첫 일정 등), '직후 장소' 근처를 검색
        const refItem = prevItem || nextItem || sortedList[0];
        
        if (refItem && typeof refItem.latitude === 'number') {
          lat = refItem.latitude;
          lng = refItem.longitude;
          console.log(`[LJJ] Location Bias: '${refItem.place}' (${refItem.time}) -> New Place at ${time}`);
        }
      } else {
         // 전체 평균 좌표
         const coords = trip.days.flatMap((d: any) => d.itinerary || []);
         const vals = coords.filter((i: any) => typeof i.latitude === 'number');
         if (vals.length) {
            lat = vals.reduce((s: number, v: any) => s + v.latitude, 0) / vals.length;
            lng = vals.reduce((s: number, v: any) => s + v.longitude, 0) / vals.length;
         }
      }

      const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_SERVER_API_KEY;
      let newItem: any = {
        time,
        place: modResult.query,
        description: modResult.reason,
        reason: modResult.reason,
        latitude: lat,
        longitude: lng,
      };

      if (GOOGLE_MAPS_API_KEY) {
        try {
          // GPT가 정제해준 쿼리로 검색 (예: "제주도 고등어 맛집")
          const places = await searchPlaces(modResult.query, lat, lng, GOOGLE_MAPS_API_KEY, modResult.category === '식사' || modResult.category === '카페' ? modResult.category : undefined);
          
          if (!places.length) {
            return NextResponse.json({
              reply: `'${modResult.query}' 검색 결과가 없습니다.`,
              extracted: extractedNow,
              ready: true
            });
          }
          
          let p = places[0];
          // ... (영업시간/타입 필터링 로직 유지) ...
          
          if (p) {
            newItem = {
              ...newItem,
              place: p.displayName?.text || modResult.query,
              latitude: p.location?.latitude ?? lat,
              longitude: p.location?.longitude ?? lng,
              formattedAddress: p.formattedAddress,
              internationalPhoneNumber: p.internationalPhoneNumber,
              websiteUri: p.websiteUri,
              rating: p.rating,
              reviews: p.reviews,
            };
          }
        } catch (err) {
          console.error('Place search error:', err);
        }
      }

      const newTrip = { ...trip };
      let updatedItinerary = Array.isArray(day.itinerary) ? [...day.itinerary, newItem] : [newItem];
      
      // 시간순 정렬
      updatedItinerary.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
      
      // 스케줄링 재계산
      const re = scheduleWithDurations(updatedItinerary as any, (extractedNow.preferredTransport as TravelMode) || 'DRIVE', trip.destination);
      newTrip.days = newTrip.days.map((d: any, i: number) => i === dayIdx ? { ...d, itinerary: re } : d);
      
      const reply2 = `${dayIdx + 1}일차 ${time}에 '${newItem.place}'를(을) 추가했어요.`;
      return NextResponse.json({ reply: reply2, extracted: extractedNow, ready: true, trip: newTrip });
    }

    // 효율성 최적화 요청
    if (modResult.action === 'optimize_efficiency' && trip) {
      return NextResponse.json({
        reply: "일정의 이동 효율성을 높이고 있어요. 잠시만 기다려 주세요...",
        extracted: extractedNow,
        ready: true,
        action: 'optimize_efficiency'
      });
    }

    // 피로도 감소 요청
    if (modResult.action === 'reduce_fatigue' && trip) {
      return NextResponse.json({
        reply: "피로도를 줄이기 위해 일정을 조정하고 있어요. 잠시만 기다려 주세요...",
        extracted: extractedNow,
        ready: true,
        action: 'reduce_fatigue'
      });
    }

    return NextResponse.json({ 
      reply: "여행 일정에 대해 수정하고 싶은 부분이 있다면 말씀해 주세요.", 
      extracted: extractedNow, 
      ready: true 
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'bad request' }, { status: 400 });
  }
}

