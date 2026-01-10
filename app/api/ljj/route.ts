// app/api/ljj/route.ts (enhanced extractor)
import { NextRequest, NextResponse } from 'next/server';
import { scheduleWithDurations, type TravelMode } from '../../../lib/scheduling';

type Extracted = {
  destination?: string;
  period?: string;
  keywords?: string;
  travelType?: 'standard'|'family'|'couple'|'roadtrip'|'relaxed'|'intense';
  budgetMode?: 'economy'|'standard'|'premium';
  include?: string;
  exclude?: string;
  preferredTransport?: 'DRIVE'|'TRANSIT'|'WALK';
  preferredTransportMulti?: Array<'DRIVE'|'TRANSIT'|'WALK'>;
};

function normalizeWhitespace(s: string) { return (s || '').replace(/\s+/g, ' ').trim(); }

function parseKoreanPeriod(text: string): string | undefined {
  const m = text.match(/(\d+)\s*박\s*(\d+)\s*일/);
  if (m) return `${m[1]}박 ${m[2]}일`;
  const d = text.match(/(\d+)\s*일/);
  if (d) return `${Math.max(1, Number(d[1]) - 1)}박 ${d[1]}일`;
  return undefined;
}

function parseDestination(text: string): string | undefined {
  const p = text.search(/\d+\s*박\s*\d+\s*일/);
  if (p > 0) {
    const before = text.slice(0, p).trim();
    const tokens = before.split(/[ ,]/).map(t => t.trim()).filter(Boolean);
    return tokens[tokens.length - 1];
  }
  const m = text.match(/([가-힣A-Za-z]+)\s*(여행|가자|가고|코스)/);
  if (m) return m[1];
  const first = text.split(/[ ,]/).map(t => t.trim()).filter(Boolean)[0];
  return first;
}

function parseTravelType(text: string): Extracted['travelType'] | undefined {
  if (/가족|아이|가족여행/i.test(text)) return 'family';
  if (/커플|신혼|로맨틱/i.test(text)) return 'couple';
  if (/로드트립|드라이브/i.test(text)) return 'roadtrip';
  if (/여유|휴양|호캉스|느긋/i.test(text)) return 'relaxed';
  if (/빡세|하드코어|강행군|타이트/i.test(text)) return 'intense';
  return undefined;
}

function parseBudget(text: string): Extracted['budgetMode'] | undefined {
  if (/가성비|저렴|싼|알뜰|경제/i.test(text)) return 'economy';
  if (/럭셔리|프리미엄|고급/i.test(text)) return 'premium';
  if (/무난|보통|중간/i.test(text)) return 'standard';
  return undefined;
}

function parseTransportMulti(text: string): Array<'DRIVE'|'TRANSIT'|'WALK'> {
  const modes: Array<'DRIVE'|'TRANSIT'|'WALK'> = [];
  if (/(대중교통|지하철|버스|transit)/i.test(text)) modes.push('TRANSIT');
  if (/(도보|걷기|walk)/i.test(text)) modes.push('WALK');
  if (/(차|렌트|드라이브|drive|car)/i.test(text)) modes.push('DRIVE');
  // 중복 제거, 입력 순서 우선
  return Array.from(new Set(modes));
}
function parseTransport(text: string): Extracted['preferredTransport'] | undefined {
  const multi = parseTransportMulti(text);
  // 우선순위: DRIVE > TRANSIT > WALK (명시적 다중이면 첫번째 발견 우선, 없으면 undefined)
  return multi[0];
}

export async function POST(req: NextRequest) {
  try {
    const { messages = [], extracted: prevExtracted = {} as Extracted, trip } = await req.json();
    const last = Array.isArray(messages) ? messages[messages.length - 1] : null;
    const userText = normalizeWhitespace(last?.content || '');

    const extractedNow: Extracted = { ...prevExtracted };
    const foundPeriod = parseKoreanPeriod(userText);
    const foundDest = parseDestination(userText);
    const foundType = parseTravelType(userText);
    const foundBudget = parseBudget(userText);
  const foundTransport = parseTransport(userText);
  const foundTransportMulti = parseTransportMulti(userText);

    if (foundDest && !extractedNow.destination) extractedNow.destination = foundDest;
    if (foundPeriod && !extractedNow.period) extractedNow.period = foundPeriod;
    if (foundType && !extractedNow.travelType) extractedNow.travelType = foundType;
    if (foundBudget && !extractedNow.budgetMode) extractedNow.budgetMode = foundBudget;
  if (foundTransport && !extractedNow.preferredTransport) extractedNow.preferredTransport = foundTransport;
  if (foundTransportMulti.length && !extractedNow.preferredTransportMulti) extractedNow.preferredTransportMulti = foundTransportMulti;

    if (!extractedNow.keywords) {
      let kw = userText;
      if (foundPeriod) kw = kw.replace(/\d+\s*박\s*\d+\s*일/, '').trim();
      if (foundDest) kw = kw.replace(new RegExp(foundDest, 'i'), '').trim();
      extractedNow.keywords = normalizeWhitespace(kw.replace(/["'\“\”]/g, '')) || undefined;
    }

    const missing: string[] = [];
    if (!extractedNow.destination) missing.push('목적지');
    if (!extractedNow.period) missing.push('기간(예: 2박3일)');

    let ask = '';
    if (missing.length) {
      ask = `${missing.join(', ')}를 알려주시면 바로 일정을 만들게요.`;
    } else {
      // 추가 선호 질문(순차 진행): 이동수단 → 여행 유형 → 예산 수준
      const asks: string[] = [];
      if (!extractedNow.preferredTransport) {
        asks.push('이동 수단을 선택해 주세요. 차량, 대중교통, 도보 중 어떤 방식이 좋으신가요?');
      }
      if (!extractedNow.travelType) {
        asks.push('여행 유형을 알려주세요. 예: 가족/커플/여유로운/빡센/로드트립 등');
      }
      if (!extractedNow.budgetMode) {
        asks.push('예산 수준은 어떤가요? 예: 가성비/보통/프리미엄');
      }
      ask = asks.join('\n');
    }

    const parts: string[] = [];
    if (extractedNow.destination) parts.push(`📍 목적지: ${extractedNow.destination}`);
    if (extractedNow.period) parts.push(`🗓️ 기간: ${extractedNow.period}`);
    if (extractedNow.keywords) parts.push(`🏷️ 키워드: ${extractedNow.keywords}`);
    if (extractedNow.travelType) parts.push(`👥 유형: ${extractedNow.travelType}`);
    if (extractedNow.budgetMode) parts.push(`💰 예산: ${extractedNow.budgetMode}`);
    if (extractedNow.preferredTransportMulti && extractedNow.preferredTransportMulti.length > 1) {
      const label = extractedNow.preferredTransportMulti
        .map(m => m === 'DRIVE' ? '차량' : m === 'TRANSIT' ? '대중교통' : '도보')
        .join(' + ');
      parts.push(`🚗 이동: ${label}`);
    } else if (extractedNow.preferredTransport) {
      const label = extractedNow.preferredTransport === 'DRIVE' ? '차량' : extractedNow.preferredTransport === 'TRANSIT' ? '대중교통' : '도보';
      parts.push(`🚗 이동: ${label}`);
    }

    const summary = parts.length ? parts.join('\n') : '요청 내용을 알려주세요 🙂';
    const reply = ask ? `${summary}\n\n${ask}` : `${summary}\n\n좋아요! 일정을 생성해 볼게요.`;

  // --- 자연어 편집: "N일차에 카테고리 장소 추가" 일반화 (라멘/카페/야경/스시/이자카야/온천/박물관/놀이공원/시장/현지식당 등) ---
    const dayMatch = /(\d+)\s*일차/i.exec(userText);
    const dayIdxReq = dayMatch ? Math.max(0, Number(dayMatch[1]) - 1) : 0;

    // 명시적 시간 추출 (예: 18:30, 18시30분, 저녁/점심/아침/야경)
    function extractTime(text: string, fallback: string): string {
      const m1 = /(\d{1,2})\s*[:시]\s*(\d{0,2})\s*분?/i.exec(text);
      if (m1) {
        const hh = String(Math.max(0, Math.min(23, Number(m1[1])))).padStart(2, '0');
        const mm = String(m1[2] ? Math.max(0, Math.min(59, Number(m1[2]))) : 0).padStart(2, '0');
        return `${hh}:${mm}`;
      }
      if (/아침|조식|브런치/i.test(text)) return '09:00';
      if (/점심|런치/i.test(text)) return '12:00';
      if (/카페|디저트|커피|브런치/i.test(text)) return '15:00';
      if (/저녁|디너/i.test(text)) return '18:30';
      if (/야경|밤/i.test(text)) return '20:00';
      return fallback;
    }

    type AddSpec = { query: string; category: '식사'|'카페'|'야경'|'관광'; defaultTime: string; reason: string; preferOpenNow?: boolean };
    function detectSpec(text: string): AddSpec | null {
      if (/(라멘|라면)/i.test(text)) return { query: '라멘', category: '식사', defaultTime: '12:00', reason: '현지 인기 라멘집에서 식사' };
      if (/(스시|초밥)/i.test(text)) return { query: '스시', category: '식사', defaultTime: '12:30', reason: '스시 맛집 방문' };
      if (/(고기|삼겹살|소고기|돼지고기|구이)/i.test(text)) return { query: '고기집', category: '식사', defaultTime: '18:30', reason: '고기 맛집에서 저녁 식사' };
      if (/(국밥|해장국|순대국)/i.test(text)) return { query: '국밥', category: '식사', defaultTime: '09:00', reason: '현지 국밥으로 든든한 식사' };
      if (/(우동|규카츠|돈카츠|규동)/i.test(text)) return { query: '우동', category: '식사', defaultTime: '12:00', reason: '현지 식사' };
      if (/(카페|커피|디저트|브런치)/i.test(text)) return { query: '카페', category: '카페', defaultTime: '15:00', reason: '카페 휴식/디저트', preferOpenNow: true };
      if (/(이자카야|술집|바|펍)/i.test(text)) return { query: '이자카야', category: '야경', defaultTime: '19:30', reason: '저녁 한잔' };
      if (/(야경|전망대|전망)/i.test(text)) return { query: '전망대', category: '야경', defaultTime: '20:00', reason: '야경 감상' };
      if (/(시장|야시장|전통시장)/i.test(text)) return { query: '전통시장', category: '식사', defaultTime: '18:30', reason: '현지 시장 체험' };
      if (/(온천|스파)/i.test(text)) return { query: '온천', category: '관광', defaultTime: '17:00', reason: '온천/스파 체험으로 힐링' };
      if (/(박물관|미술관|뮤지엄|갤러리)/i.test(text)) return { query: '박물관', category: '관광', defaultTime: '11:00', reason: '문화·예술 감상' };
      if (/(놀이공원|테마파크|유원지)/i.test(text)) return { query: '놀이공원', category: '관광', defaultTime: '10:00', reason: '놀이공원/테마파크 즐기기' };
      if (/(현지식당|로컬식당|로컬 맛집|현지 맛집)/i.test(text)) return { query: '현지 식당', category: '식사', defaultTime: '12:30', reason: '현지인들이 찾는 로컬 식당 방문' };
      // 일반 "식당" 키워드 (구체적 음식 언급 없을 때)
      if (/(식당|맛집|레스토랑)/i.test(text)) return { query: '식당', category: '식사', defaultTime: '12:00', reason: '현지 맛집에서 식사' };
      return null;
    }

    // 인용부호/정확명 추출("스타벅스 리저브 바" 등)
    function extractQuotedQuery(text: string): string | null {
      const m = /["“'‘]([^"”'’]{2,})["”'’]/.exec(text);
      return m ? m[1].trim() : null;
    }

    // 일차 미지정 시: 아이템 수가 가장 적은 날(=가장 여유로운 날) 선택
    function pickBestDayIndex(tripData: any): number {
      if (!tripData?.days?.length) return 0;
      let best = 0;
      let minCount = Number.MAX_SAFE_INTEGER;
      tripData.days.forEach((d: any, idx: number) => {
        const c = Array.isArray(d.itinerary) ? d.itinerary.length : 0;
        if (c < minCount) { minCount = c; best = idx; }
      });
      return best;
    }

    async function searchPlaces(query: string, lat: number, lng: number, apiKey: string, categoryFilter?: '식사' | '카페') {
      const body: any = {
        textQuery: query,
        locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 5000 } },
        languageCode: 'ko'
      };
      
      // 식사 카테고리면 restaurant만, 카페면 cafe만 검색
      if (categoryFilter === '식사') {
        body.includedType = 'restaurant';
      } else if (categoryFilter === '카페') {
        body.includedType = 'cafe';
      }
      
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

    async function fetchOpenNow(placeId: string, apiKey: string): Promise<boolean | null> {
      try {
        const url = `https://places.googleapis.com/v1/places/${placeId}?languageCode=ko`;
        const headers = {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'id,currentOpeningHours.openNow'
        } as any;
        const r = await fetch(url, { headers });
        const d = await r.json();
        return d?.currentOpeningHours?.openNow ?? null;
      } catch { return null; }
    }

    const quoted = extractQuotedQuery(userText);
    const spec = detectSpec(userText);
    if ((spec || quoted) && trip && Array.isArray(trip.days)) {
      let dayIdx = dayMatch ? Math.max(0, Math.min(dayIdxReq, trip.days.length - 1)) : pickBestDayIndex(trip);
      const day = trip.days[dayIdx];

      // 기존 장소 목록 수집 (중복 체크용)
      const allPlaces = trip.days.flatMap((d: any) => 
        (d.itinerary || []).map((item: any) => (item.place || '').toLowerCase().trim())
      );
      
      // 중복 체크 함수
      const checkDuplicate = (placeName: string): boolean => {
        const normalized = placeName.toLowerCase().trim();
        return allPlaces.some((existingPlace: string) => {
          // 완전 일치 또는 포함 관계
          return existingPlace === normalized || 
                 existingPlace.includes(normalized) || 
                 normalized.includes(existingPlace);
        });
      };

      // 기준 좌표 결정: 시간대별로 인근 장소 기준
      let lat = 35.0, lng = 135.0; // generic default
      const list = day.itinerary || [];
      const time = extractTime(userText, spec ? spec.defaultTime : '12:00');
      
      // 시간대에 맞는 인근 장소 찾기
      if (list.length > 0) {
        const targetHour = parseInt(time.split(':')[0], 10);
        
        // 해당 시간 전후의 장소 찾기
        let closestItem = list[0];
        let minTimeDiff = Infinity;
        
        for (const item of list) {
          if (!item.time) continue;
          const itemHour = parseInt(item.time.split(':')[0], 10);
          const timeDiff = Math.abs(itemHour - targetHour);
          
          if (timeDiff < minTimeDiff) {
            minTimeDiff = timeDiff;
            closestItem = item;
          }
        }
        
        // 가장 가까운 시간대 장소의 좌표 사용
        if (typeof closestItem.latitude === 'number' && typeof closestItem.longitude === 'number') {
          lat = closestItem.latitude;
          lng = closestItem.longitude;
          console.log(`[장소 추가] ${time} 기준으로 ${closestItem.time} ${closestItem.place} 인근 검색 (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        }
      } else {
        // 첫 장소가 없으면 전체 평균
        const coords = trip.days.flatMap((d: any) => d.itinerary || []);
        const vals = coords.filter((i: any) => typeof i.latitude === 'number' && typeof i.longitude === 'number');
        if (vals.length) {
          lat = vals.reduce((s: number, v: any) => s + v.latitude, 0) / vals.length;
          lng = vals.reduce((s: number, v: any) => s + v.longitude, 0) / vals.length;
        }
      }

      const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_SERVER_API_KEY;
      let newItem: any = {
        time,
        place: quoted || (spec ? spec.query : ''),
        description: spec ? `${spec.reason} (카테고리: ${spec.category})` : '요청하신 장소를 추가합니다.',
        reason: spec ? spec.reason : '사용자 지정 장소',
        latitude: lat,
        longitude: lng,
      };

      if (GOOGLE_MAPS_API_KEY) {
        try {
          const q = quoted || (spec ? spec.query : '');
          // 카테고리 필터 전달 (식사/카페만)
          const places = await searchPlaces(q, lat, lng, GOOGLE_MAPS_API_KEY, spec?.category === '식사' || spec?.category === '카페' ? spec.category : undefined);
          
          if (!places.length) {
            // 검색 결과 없으면 에러 반환
            return NextResponse.json({
              reply: `'${q}' 검색 결과가 없습니다. 다른 키워드로 다시 시도해 주세요.`,
              extracted: extractedNow,
              ready: true
            });
          }
          
          let p = places[0];

          // 식사 카테고리인 경우 restaurant 타입 확인
          if (spec?.category === '식사') {
            const restaurantPlace = places.find((pl: any) => 
              Array.isArray(pl.types) && pl.types.includes('restaurant')
            );
            if (restaurantPlace) {
              p = restaurantPlace;
            } else {
              // restaurant 타입이 하나도 없으면 거부
              return NextResponse.json({
                reply: `'${q}'는 식당이 아닙니다. 정확한 식당명으로 다시 요청해 주세요.`,
                extracted: extractedNow,
                ready: true
              });
            }
          }

          // 카테고리별 시간대 필터: 카페는 영업중 선호
          if (spec?.preferOpenNow && places.length) {
            for (const cand of places.slice(0, 5)) {
              const on = await fetchOpenNow(cand.id, GOOGLE_MAPS_API_KEY);
              if (on === true) { p = cand; break; }
            }
          }
          
          if (p) {
            const foundPlaceName = p.displayName?.text || q;
            
            // ⚠️ 중복 체크: 실제 검색된 장소명으로 확인
            if (checkDuplicate(foundPlaceName)) {
              return NextResponse.json({
                reply: `'${foundPlaceName}'는 이미 일정에 포함되어 있습니다. 다른 장소를 추천해 드릴까요?`,
                extracted: extractedNow,
                ready: true
              });
            }
            
            newItem = {
              ...newItem,
              place: foundPlaceName,
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
      
      // 기존 일정에 새 항목 추가 후 시간순 정렬
      let updatedItinerary = Array.isArray(day.itinerary) ? [...day.itinerary, newItem] : [newItem];
      
      // 시간순으로 정렬 (HH:MM 형식)
      updatedItinerary.sort((a, b) => {
        const timeA = a.time || '00:00';
        const timeB = b.time || '00:00';
        return timeA.localeCompare(timeB);
      });
      
      // 스케줄링 재계산
      const re = scheduleWithDurations(updatedItinerary as any, (extractedNow.preferredTransport as TravelMode) || 'DRIVE', trip.destination);
      newTrip.days = newTrip.days.map((d: any, i: number) => i === dayIdx ? { ...d, itinerary: re } : d);
      
      const timeLabel = time.split(':')[0] + '시경';
      const reply2 = `${dayIdx + 1}일차 ${timeLabel}에 '${newItem.place}'를(을) 추가했어요. 필요하면 다른 장소도 말씀해 주세요.`;
      return NextResponse.json({ reply: reply2, extracted: extractedNow, ready: true, trip: newTrip });
    }

  const ready = !ask; // 남은 질문이 없을 때만 ready
    return NextResponse.json({ reply, extracted: extractedNow, ready });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'bad request' }, { status: 400 });
  }
}

