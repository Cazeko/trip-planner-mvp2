// lib/scheduling.ts
import type { ItineraryItem } from '../types/trip';
import { getCityProfile, getAdjustedSpeed, getTransitWaitTime, type CityProfile } from './cityProfiles';

// Haversine 거리 계산 (미터)
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export type TravelMode = 'DRIVE' | 'WALK' | 'TRANSIT';

// 기본 속도 모델 (도시 프로파일로 조정됨)
export function speedByMode(mode: TravelMode): number {
  switch (mode) {
    case 'WALK': return 1.4; // ~5km/h (보행)
    case 'TRANSIT': return 10; // ~36km/h (대중교통, 환승 대기 포함)
    case 'DRIVE':
    default: return 13; // ~47km/h (도심 평균)
  }
}

// 도시 프로파일을 반영한 이동 시간 계산
export function calculateTravelTime(
  distanceMeters: number, 
  mode: TravelMode, 
  cityProfile?: CityProfile
): number {
  const baseSpeed = speedByMode(mode);
  const adjustedSpeed = cityProfile 
    ? getAdjustedSpeed(baseSpeed, mode, cityProfile)
    : baseSpeed;
  
  let travelSeconds = distanceMeters / adjustedSpeed;
  
  // 대중교통: 도시별 대기 시간
  if (mode === 'TRANSIT') {
    const waitTime = cityProfile 
      ? getTransitWaitTime(cityProfile)
      : Math.min(600, Math.max(300, distanceMeters / 2000 * 300));
    travelSeconds += waitTime;
  }
  
  // 도보: 단거리(<500m)는 약간의 여유 시간 추가
  if (mode === 'WALK' && distanceMeters < 500) {
    travelSeconds += 120; // 2분 여유
  }
  
  return Math.round(travelSeconds);
}

// legs 추정 (도시 프로파일 적용)
export function estimateLegsLocal(
  itinerary: ItineraryItem[], 
  travelMode: TravelMode,
  destination?: string
) {
  const legs: { distanceMeters: number; durationSeconds: number }[] = [];
  if (!Array.isArray(itinerary)) return legs;
  
  const cityProfile = destination ? getCityProfile(destination) : undefined;
  
  for (let i = 0; i < itinerary.length - 1; i++) {
    const a = itinerary[i];
    const b = itinerary[i + 1];
    const d = haversine(a.latitude, a.longitude, b.latitude, b.longitude);
    const duration = calculateTravelTime(d, travelMode, cityProfile);
    legs.push({ distanceMeters: Math.round(d), durationSeconds: duration });
  }
  return legs;
}

// 간단 재배치 (현재는 패스스루)
export function reassignWithAnchorsAndLegs(
  itinerary: ItineraryItem[],
  _options?: { legs?: any[] }
): ItineraryItem[] {
  return itinerary.map((it) => ({ ...it }));
}

// 기본 체류시간(분) 휴리스틱 - 카테고리별 차별화
export function defaultStayMinutes(item: ItineraryItem): number {
  const name = (item.place || '').toLowerCase();
  const desc = (item.description || '').toLowerCase();
  const types = (item as any).types as string[] | undefined;
  const t = types?.join(' ').toLowerCase() || '';
  const combined = name + ' ' + desc + ' ' + t;
  
  // 카테고리 추출: 설명 끝에 "(카테고리: xxx)" 형식
  const catMatch = desc.match(/\(카테고리:\s*([^)]+)\)/i);
  const category = catMatch ? catMatch[1].trim() : '';
  
  // 카테고리 우선 판단
  if (/식사|맛집|음식|레스토랑/.test(category)) return 90;
  if (/카페|디저트|커피/.test(category)) return 60;
  if (/야경|저녁|나이트/.test(category)) return 75;
  if (/관광|체험|박물관|전망대/.test(category)) return 120;
  
  // 폴백: 키워드 기반
  if (/restaurant|food|식당|맛집|ramen|sushi|izakaya|음식/.test(combined)) return 90;
  if (/cafe|coffee|카페|디저트/.test(combined)) return 60;
  if (/temple|shrine|museum|park|전망대|야경|박물관|공원|성/.test(combined)) return 120;
  
  return 90; // 기본값
}

// 가장 가까운 10분 단위로 반올림
function roundTo10Min(date: Date) {
  const d = new Date(date);
  const mins = d.getMinutes();
  const rounded = Math.round(mins / 10) * 10;
  d.setMinutes(rounded, 0, 0);
  return d;
}

function toTimeString(date: Date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function parseTime(s?: string): Date | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = new Date();
  d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  return d;
}

// legs + 체류시간 기반 시간표 생성 (도시 프로파일 반영)
export function scheduleWithDurations(
  itinerary: ItineraryItem[], 
  travelMode: TravelMode,
  destination?: string
): ItineraryItem[] {
  if (!itinerary.length) return itinerary;
  const startTime = roundTo10Min(parseTime(itinerary[0].time) ?? new Date(new Date().setHours(9, 0, 0, 0)));
  const legs = estimateLegsLocal(itinerary, travelMode, destination);
  const scheduled: ItineraryItem[] = [];
  let current = new Date(startTime);
  for (let i = 0; i < itinerary.length; i++) {
    const item = { ...itinerary[i] };
    if (i > 0) {
      // 이동 시간 반영
      const leg = legs[i - 1];
      if (leg) current = new Date(current.getTime() + leg.durationSeconds * 1000);
    }
    // 10분 단위 반올림 후 시간 설정
    current = roundTo10Min(current);
    item.time = toTimeString(current);
    // 체류시간 적용
    const stay = defaultStayMinutes(item);
    current = new Date(current.getTime() + stay * 60 * 1000);
    // 다음 아이템 시작도 10분 단위로 보정
    current = roundTo10Min(current);
    scheduled.push(item);
  }
  return scheduled;
}

