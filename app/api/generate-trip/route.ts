// app/api/generate-trip/route.ts
import OpenAI from 'openai';
import type { Day, ItineraryItem, TripData, PlaceDetails } from '../../../types/trip';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getPlaceDetails(placeName: string, lat: number, lng: number): Promise<PlaceDetails | null> {
  if (!placeName || placeName === 'undefined' || placeName.trim() === '') {
    // 불필요한 빈 질의로 API 호출하지 않음
    return null;
  }
  console.log(`[Google Places API] Searching for: "${placeName}"`);
  
  // ✨✨✨ 서버 전용 API 키를 사용하도록 변경되었습니다. ✨✨✨
  const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_SERVER_API_KEY;

  if (!GOOGLE_MAPS_API_KEY) {
    console.error("[Google Places API] Error: GOOGLE_MAPS_SERVER_API_KEY is missing in .env.local");
    return null;
  }

  const url = 'https://places.googleapis.com/v1/places:searchText';
  
  const body = {
    textQuery: placeName,
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 10000.0  // 5km → 10km로 확대하여 더 많은 후보 검색
      }
    },
    languageCode: 'ko'
  };

  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
    'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri,places.rating,places.regularOpeningHours,places.reviews'
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: headers,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error(`[Google Places API] Error for "${placeName}":`, data?.error?.message || 'Unknown error');
      return null;
    }

    if (data.places && data.places.length > 0) {
      console.log(`[Google Places API] Success: Found ${data.places.length} results for "${placeName}"`);
      
      // 여러 후보 중 가장 정보가 많은 장소 선택 (rating, phone, address가 있는 것 우선)
      const scoredPlaces = data.places.map((p: any) => ({
        place: p,
        score: (p.rating ? 2 : 0) + 
               (p.internationalPhoneNumber ? 2 : 0) + 
               (p.formattedAddress ? 1 : 0) +
               (p.reviews && p.reviews.length > 0 ? 2 : 0)
      }));
      scoredPlaces.sort((a: any, b: any) => b.score - a.score);
      
      const place = scoredPlaces[0].place;
      console.log(`[Google Places API] Selected place with score ${scoredPlaces[0].score}:`, place.displayName?.text || placeName);
      
      // displayName.text를 명시적으로 추출하여 반환
      const details = {
        formattedAddress: place.formattedAddress || null,
        internationalPhoneNumber: place.internationalPhoneNumber || null,
        websiteUri: place.websiteUri || null,
        rating: place.rating || null,
        regularOpeningHours: place.regularOpeningHours || null,
        reviews: place.reviews || null,
      };
      console.log(`[Google Places API] Extracted details:`, JSON.stringify(details, null, 2));
      return details;
    } else {
      console.warn(`[Google Places API] Warning: No results found for "${placeName}"`);
      return null;
    }
  } catch (error) {
    console.error(`[Google Places API] Network or parsing error for "${placeName}":`, error);
    return null;
  }
}

// app/api/generate-trip/route.ts

// ... (openai 인스턴스와 getPlaceDetails 함수는 그대로 둡니다) ...

function parsePeriodToDays(period?: string): number {
  if (!period) return 3; // default
  const m = period.match(/(\d+)\s*박\s*(\d+)\s*일/);
  if (m) return Math.max(1, parseInt(m[2], 10));
  const d = period.match(/(\d+)\s*일/);
  if (d) return Math.max(1, parseInt(d[1], 10));
  return 3;
}

export async function POST(req: Request) {
  try {
    const { destination, period, keywords, preferredTransport } = await req.json();
    const dayCount = parsePeriodToDays(period);

    const prompt = `
      당신은 최고의 여행 일정 전문가입니다.
      아래 조건에 맞춰 여행 일정을 계획해 주세요.
      
      ⚠️ 매우 중요한 규칙:
      
      1. **시간 규칙 (엄격 준수)**:
         - 하루 일정은 09:00 시작, 21:00 종료 (밤 9시까지만)
         - 절대로 22:00(밤 10시) 이후 일정을 만들지 마세요
         - 새벽 시간(00:00~06:00)에 일정을 절대 배치하지 마세요
      
      2. **식사 시간 규칙 (절대 엄수)**:
         - 아침 식사: 09:00~10:30 사이 (반드시 이 시간대에만)
         - 점심 식사: 12:00~13:30 사이 (반드시 이 시간대에만)
         - 저녁 식사: 18:00~20:00 사이 (반드시 이 시간대에만)
         - 식당이 아닌 관광지를 식당이라고 거짓으로 표기하지 마세요
         - 예시: "이치란 라멘", "스시 사에키", "자갈치시장", "구로몬시장"
      
      3. **지역 집중 규칙**:
         - 여러 도시 여행 시 하루에 한 도시만 방문 (예: Day1 오사카, Day2 교토, Day3 나라)
         - 같은 날 오사카↔교토 같은 도시 간 이동 절대 금지
         - 한 도시 내에서도 지리적으로 가까운 장소들로 구성
      
      4. **영업시간 규칙**:
         - 수족관, 박물관, 놀이공원: 10:00~18:00 사이에만 방문
         - 이런 장소들은 최소 2~3시간 체류 시간 확보
         - 밤 시간(20:00 이후)에는 야경, 바, 야시장만 가능
      
      5. **중복 방지 규칙**:
         - 전체 일정에서 같은 장소를 두 번 이상 방문하지 마세요
         - 같은 지역도 가능한 한 번만 방문
         - 비슷한 성격의 장소(예: 타워 2개, 시장 2개)도 피하세요
      
      6. **장소 이름 규칙**:
         - 반드시 "실제로 존재하는 Google Maps에서 검색 가능한 정확한 상호명" 사용
         - 좋은 예: "오사카 수족관 카이유칸", "도톤보리", "이치란 라멘 도톤보리점"
         - 나쁜 예: "조용한 카페", "전망 좋은 레스토랑"
      
      각 장소는 다음 정확한 키를 사용해 주세요:
      - time: 24시간 형식 문자열 (예: "09:30")
      - place: 장소의 정확 명칭
      - description: 간단한 설명
      - reason: 추천 이유
      - latitude: 숫자
      - longitude: 숫자
      
      ---
      ### 중요 ###
      - 모든 결과는 반드시 "한국어"로 작성
      - 전체 결과는 반드시 JSON 형식으로 반환
      - 식당은 절대 거짓 정보를 생성하지 말 것
      ---

      - 여행지: ${destination}
      - 기간: ${period}
      - 핵심 키워드: ${keywords}

      JSON 스키마(반드시 이 형태의 키 사용):
      {
        "tripTitle": "${destination} ${keywords || ''} 여행",
        "days": [
          {
            "day": 1,
            "itinerary": [
              { "time": "09:00", "place": "정확한 장소명", "description": "설명", "reason": "추천 이유", "latitude": 35.0, "longitude": 135.0 }
            ]
          }
        ]
      }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: (
        prompt + `\n\n추가 제약:\n- 총 일수는 정확히 ${dayCount}일 (Day 1 ~ Day ${dayCount})로 구성하세요.\n- 각 Day에는 최소 6~8개의 방문지를 시간대 순으로 배치하세요.\n- 시작 시간은 보통 09:00 전후로, 하루 일정이 무리 없이 진행되도록 하세요.\n\n⚠️ 식사 시간대 필수 포함:\n- 아침 식사 (09:00~10:30): 실제 존재하는 식당 또는 시장/브런치 카페\n- 점심 식사 (12:00~13:30): 실제 존재하는 맛집 또는 먹거리 지역\n- 저녁 식사 (18:00~20:00): 실제 존재하는 고급 식당, 이자카야, 또는 야시장\n- 저녁 이후 (20:30~22:00): 야경, 바, 라이브 공연, 야시장 등\n\n⚠️ 중복 방지:\n- 전체 ${dayCount}일 일정에서 같은 장소를 절대 두 번 방문하지 마세요\n- 이미 방문한 장소는 다른 날에도 포함하지 마세요\n- 각 Day마다 다른 지역, 다른 컨셉의 장소를 추천하세요\n\n- 이동수단 선호: ${preferredTransport || 'DRIVE'} 를 고려해 동선이 자연스럽게 이어지도록 구성하세요.\n- 각 아이템의 설명 끝에 (카테고리: 식사|관광|카페|야경 등) 형태로 간단히 카테고리를 표시하세요.\n- 모든 장소는 실제 존재하는 위치로 위도(latitude)/경도(longitude)를 포함하세요.\n- 각 방문지 간 시간 간격은 이동시간/체류시간을 고려해 50~140분 간격으로 자연스럽게 이어지도록 하세요.\n`
      ) }],
      response_format: { type: "json_object" },
    });
    
    const messageContent = response.choices[0].message.content;
    if (!messageContent) {
      // ✨ 에러가 발생하면 여기서 즉시 에러 응답을 반환하고 함수를 종료합니다.
      throw new Error("AI로부터 유효한 응답을 받지 못했습니다.");
    }

    const aiTripData: TripData = JSON.parse(messageContent);

    // 아이템 키 보정: OpenAI가 다른 키를 사용할 경우를 대비해 place/description/time 등 보장
    const normalizedDays: Day[] = (aiTripData.days || []).map((d: Day, idx: number) => {
      const it = Array.isArray(d.itinerary) ? d.itinerary.map((raw: any) => {
        const item: ItineraryItem = {
          time: raw.time || raw.startTime || '09:00',
          place: raw.place || raw.name || raw.title || '',
          description: raw.description || raw.summary || '',
          reason: raw.reason || raw.note || '',
          latitude: typeof raw.latitude === 'number' ? raw.latitude : (typeof raw.lat === 'number' ? raw.lat : 0),
          longitude: typeof raw.longitude === 'number' ? raw.longitude : (typeof raw.lng === 'number' ? raw.lng : 0),
        };
        return item;
      }) : [];
      return { day: d.day || (idx + 1), itinerary: it } as Day;
    });

    const enrichedDays = await Promise.all(
      normalizedDays.map(async (day: Day) => {
        const enrichedItinerary = await Promise.all(
          day.itinerary.map(async (item: ItineraryItem) => {
            // place 필드가 없거나 잘못된 경우(빈 문자열/undefined)는 API 호출 스킵
            if (!item.place || item.place === 'undefined' || item.place.trim() === '') {
              return item;
            }
            const placeDetails = await getPlaceDetails(item.place, item.latitude, item.longitude);
            return placeDetails ? { ...item, ...placeDetails } : item;
          })
        );
        return { ...day, itinerary: enrichedItinerary };
      })
    );

    // 보정: Day 개수가 맞지 않으면 잘라내거나 채워 넣기
    let fixedDays = enrichedDays;
    if (enrichedDays.length > dayCount) {
      fixedDays = enrichedDays.slice(0, dayCount).map((d, idx) => ({ ...d, day: idx + 1 }));
    } else if (enrichedDays.length < dayCount) {
      const addCount = dayCount - enrichedDays.length;
      const extras: Day[] = Array.from({ length: addCount }, (_, i) => ({ day: enrichedDays.length + i + 1, itinerary: [] }));
      fixedDays = [...enrichedDays, ...extras];
    }

    // 각 Day 최소 4개 보장(부족하면 앞 아이템 복제해서 채우기 — 임시 보정)
    fixedDays = fixedDays.map((d) => {
      const it = [...d.itinerary];
      while (it.length < 4 && it.length > 0) {
        it.push({ ...it[it.length - 1] });
      }
      return { ...d, itinerary: it };
    });

  const enrichedTripData = { ...aiTripData, tripTitle: aiTripData.tripTitle || `${destination} ${keywords || ''} 여행`, days: fixedDays };
    
    // ✨ 모든 작업이 성공했을 때, 여기서 성공 응답을 반환합니다.
    return new Response(JSON.stringify(enrichedTripData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("[API Route Error]", error);
    // ✨ try 블록 안에서 어떤 종류의 에러가 발생하더라도, catch 블록에서 에러 응답을 반환합니다.
    return new Response(JSON.stringify({ error: error.message || "일정을 생성하는 데 실패했습니다." }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}