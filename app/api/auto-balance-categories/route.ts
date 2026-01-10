// app/api/auto-balance-categories/route.ts
import { NextRequest, NextResponse } from 'next/server';
import type { Day, ItineraryItem } from '../../../types/trip';
import { validateCategoryBalance, extractCategory } from '../../../lib/categoryBalance';

// 카테고리별 Places API 타입 매핑
// Google Places API v1에서 일부 타입(예: food, coffee_shop)은 지원되지 않아 400 에러를 발생시킴.
// 안전한 대표 타입만 사용하도록 축소.
const categoryToPlaceTypes: Record<string, string[]> = {
  '식사': ['restaurant'],
  '카페': ['cafe', 'bakery'],
  '관광': ['tourist_attraction', 'museum', 'art_gallery', 'park', 'aquarium', 'zoo'],
  '야경': ['tourist_attraction', 'park', 'bar', 'night_club'], // 야간 명소 (우선순위 높은 것부터)
};

// 근처 장소 검색 (Google Places API)
async function findNearbyPlaces(
  lat: number,
  lng: number,
  category: string,
  excludePlaceIds: Set<string>
): Promise<any[]> {
  const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!GOOGLE_MAPS_API_KEY) {
    console.error('[Auto Balance] Missing API key');
    return [];
  }

  const placeTypes = categoryToPlaceTypes[category] || ['tourist_attraction'];
  const url = 'https://places.googleapis.com/v1/places:searchNearby';

  const body = {
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 3000.0, // 3km 반경
      },
    },
    includedTypes: placeTypes,
    maxResultCount: 10,
    languageCode: 'ko',
    rankPreference: 'POPULARITY',
  };

  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
    'X-Goog-FieldMask':
      'places.id,places.displayName,places.location,places.formattedAddress,places.rating,places.types,places.priceLevel',
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Auto Balance] Places API error:', data);
      return [];
    }

    // 이미 일정에 있는 장소 제외
    const candidates = (data.places || []).filter(
      (p: any) => !excludePlaceIds.has(p.id)
    );

    return candidates.slice(0, 3); // 상위 3개만
  } catch (error) {
    console.error('[Auto Balance] Network error:', error);
    return [];
  }
}

// 일정에 장소 삽입 (적절한 시간대에)
function insertPlaceIntoDay(
  day: Day,
  newPlace: any,
  category: string
): Day {
  const itinerary = [...day.itinerary];

  // 카테고리별 적절한 삽입 위치 결정
  let insertIndex = itinerary.length; // 기본: 맨 끝

  if (category === '식사') {
    // 점심(11:00~14:00) 또는 저녁(17:00~20:00) 시간대 찾기
    const lunchIndex = itinerary.findIndex((it) => {
      const hour = parseInt((it.time || '').split(':')[0], 10);
      return hour >= 11 && hour <= 14;
    });
    const dinnerIndex = itinerary.findIndex((it) => {
      const hour = parseInt((it.time || '').split(':')[0], 10);
      return hour >= 17 && hour <= 20;
    });

    if (lunchIndex === -1 && dinnerIndex !== -1) {
      insertIndex = dinnerIndex; // 점심 없으면 저녁 전에
    } else if (dinnerIndex === -1 && lunchIndex !== -1) {
      insertIndex = itinerary.length; // 저녁 없으면 끝에
    } else {
      insertIndex = lunchIndex !== -1 ? lunchIndex : itinerary.length;
    }
  } else if (category === '카페') {
    // 오후 시간(14:00~17:00)에 삽입
    const afternoonIndex = itinerary.findIndex((it) => {
      const hour = parseInt((it.time || '').split(':')[0], 10);
      return hour >= 14 && hour <= 17;
    });
    insertIndex = afternoonIndex !== -1 ? afternoonIndex + 1 : itinerary.length;
  } else if (category === '야경') {
    // 저녁 시간(18:00 이후)에 삽입
    insertIndex = itinerary.length; // 맨 끝
  } else if (category === '관광') {
    // 오전/오후 적절한 위치
    const morningIndex = itinerary.findIndex((it) => {
      const hour = parseInt((it.time || '').split(':')[0], 10);
      return hour >= 9 && hour <= 12;
    });
    insertIndex = morningIndex !== -1 ? morningIndex + 1 : 1;
  }

  // 새 장소 아이템 생성
  const newItem: ItineraryItem = {
    time: '00:00', // 스케줄링 함수가 다시 계산함
    place: newPlace.displayName?.text || '새로운 장소',
    description: `(카테고리: ${category}) 자동 추가된 장소`,
    reason: `${category} 카테고리 균형을 위해 추천`,
    latitude: newPlace.location?.latitude || 0,
    longitude: newPlace.location?.longitude || 0,
    formattedAddress: newPlace.formattedAddress,
    rating: newPlace.rating,
    types: newPlace.types,
  };

  itinerary.splice(insertIndex, 0, newItem);

  return { ...day, itinerary };
}

export async function POST(req: NextRequest) {
  try {
    const { days, destination } = await req.json();

    if (!days || !Array.isArray(days)) {
      return NextResponse.json(
        { error: 'Invalid days data' },
        { status: 400 }
      );
    }

    const balancedDays: Day[] = [];
    const suggestions: string[] = [];

    for (const day of days) {
      let currentDay = { ...day };
      const { balanced, missing } = validateCategoryBalance(currentDay);

      if (balanced) {
        balancedDays.push(currentDay);
        continue;
      }

      // 일정이 비어있는 경우(장소 좌표가 없으면) 외부 검색을 시도하기 어렵습니다.
      // 이 경우엔 후보 검색을 시도하지 않고 사용자에게 안내합니다.
      if (!currentDay.itinerary || currentDay.itinerary.length === 0) {
        suggestions.push(`Day ${day.day}: 일정이 비어 있어 균형 조정이 필요합니다. 직접 장소를 추가해 주세요.`);
        balancedDays.push(currentDay);
        continue;
      }

      // 현재 일정의 중심 좌표 계산
      const centerLat =
        currentDay.itinerary.reduce((sum: number, it: ItineraryItem) => sum + it.latitude, 0) /
        currentDay.itinerary.length;
      const centerLng =
        currentDay.itinerary.reduce((sum: number, it: ItineraryItem) => sum + it.longitude, 0) /
        currentDay.itinerary.length;

      // 이미 있는 장소 ID 수집
      const existingPlaceIds = new Set<string>(
        currentDay.itinerary
          .map((it: any) => it.id)
          .filter((id: any) => id)
      );

      // 부족한 카테고리마다 장소 검색 및 추가
      for (const missingCat of missing) {
        const candidates = await findNearbyPlaces(
          centerLat,
          centerLng,
          missingCat,
          existingPlaceIds
        );

        if (candidates.length > 0) {
          const bestCandidate = candidates[0]; // 가장 인기 있는 장소
          currentDay = insertPlaceIntoDay(currentDay, bestCandidate, missingCat);
          suggestions.push(
            `Day ${day.day}: ${missingCat} 카테고리에 "${bestCandidate.displayName?.text}" 추가됨`
          );
        } else {
          suggestions.push(
            `Day ${day.day}: ${missingCat} 카테고리 장소를 찾을 수 없음`
          );
        }
      }

      balancedDays.push(currentDay);
    }

    return NextResponse.json({
      days: balancedDays,
      suggestions,
      message: '카테고리 균형 조정 완료',
    });
  } catch (error: any) {
    console.error('[Auto Balance] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to balance categories' },
      { status: 500 }
    );
  }
}
