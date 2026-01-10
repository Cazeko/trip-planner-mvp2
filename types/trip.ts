// types/trip.ts

import { ReactNode } from "react";

// Places API (New)의 응답 형식에 맞춘 타입
export interface PlaceDetails {
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
  };
  reviews?: {
    authorAttribution: {
      displayName: string;
    };
    rating: number;
    text: {
      text: string;
    };
  }[];
}

// AI 정보와 Google 정보를 합친 최종 아이템 타입
export interface ItineraryItem extends PlaceDetails {
  // --- AI가 주는 정보 ---
  time: string;
  place: string;
  description: string;
  reason: string;
  latitude: number;
  longitude: number;

  // Google Places 관련 추가 정보 (선택적)
  types?: string[];
  photoReference?: string;

  // --- [예산 기능 추가] ---
  // 각 항목의 예상 경비를 저장할 필드 (선택적)
  expense?: number; 
  // --- [여기까지] ---
}

export interface Day {
  day: number;
  itinerary: ItineraryItem[];
}

export interface TripData {
  tripTitle: string;
  days: Day[];
  // --- [수정] 아래 3개의 속성을 추가합니다 ---
  destination: string;
  period: string;
  keywords: string;
}