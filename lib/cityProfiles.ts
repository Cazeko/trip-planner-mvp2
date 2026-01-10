// lib/cityProfiles.ts
// 도시별 이동 특성 프로파일

export type CityType = 'major-metro' | 'metro' | 'city' | 'tourist' | 'rural';

export interface CityProfile {
  type: CityType;
  speedModifier: {
    DRIVE: number;    // 배율 (1.0 = 기본)
    TRANSIT: number;
    WALK: number;
  };
  congestionFactor: number;  // 교통 혼잡도 (1.0 = 보통, >1 = 혼잡)
  transitWaitTime: number;   // 대중교통 평균 대기 시간 (초)
}

// 도시별 프로파일 정의
const cityProfiles: Record<string, CityProfile> = {
  // 주요 대도시 (서울, 경기 수도권)
  '서울': {
    type: 'major-metro',
    speedModifier: { DRIVE: 0.7, TRANSIT: 1.1, WALK: 1.0 },
    congestionFactor: 1.5,
    transitWaitTime: 300, // 5분
  },
  '인천': {
    type: 'major-metro',
    speedModifier: { DRIVE: 0.75, TRANSIT: 1.05, WALK: 1.0 },
    congestionFactor: 1.4,
    transitWaitTime: 360,
  },
  '경기': {
    type: 'major-metro',
    speedModifier: { DRIVE: 0.8, TRANSIT: 1.0, WALK: 1.0 },
    congestionFactor: 1.3,
    transitWaitTime: 420,
  },
  '수원': {
    type: 'metro',
    speedModifier: { DRIVE: 0.85, TRANSIT: 1.0, WALK: 1.0 },
    congestionFactor: 1.2,
    transitWaitTime: 360,
  },

  // 광역시
  '부산': {
    type: 'metro',
    speedModifier: { DRIVE: 0.8, TRANSIT: 1.05, WALK: 1.0 },
    congestionFactor: 1.3,
    transitWaitTime: 360,
  },
  '대구': {
    type: 'metro',
    speedModifier: { DRIVE: 0.85, TRANSIT: 1.0, WALK: 1.0 },
    congestionFactor: 1.2,
    transitWaitTime: 360,
  },
  '광주': {
    type: 'metro',
    speedModifier: { DRIVE: 0.9, TRANSIT: 1.0, WALK: 1.0 },
    congestionFactor: 1.15,
    transitWaitTime: 420,
  },
  '대전': {
    type: 'metro',
    speedModifier: { DRIVE: 0.9, TRANSIT: 1.0, WALK: 1.0 },
    congestionFactor: 1.15,
    transitWaitTime: 420,
  },
  '울산': {
    type: 'metro',
    speedModifier: { DRIVE: 0.95, TRANSIT: 0.95, WALK: 1.0 },
    congestionFactor: 1.1,
    transitWaitTime: 480,
  },

  // 관광 도시
  '제주': {
    type: 'tourist',
    speedModifier: { DRIVE: 1.1, TRANSIT: 0.8, WALK: 1.2 },
    congestionFactor: 1.2, // 성수기 혼잡
    transitWaitTime: 900, // 15분
  },
  '강릉': {
    type: 'tourist',
    speedModifier: { DRIVE: 1.15, TRANSIT: 0.8, WALK: 1.1 },
    congestionFactor: 1.1,
    transitWaitTime: 720,
  },
  '경주': {
    type: 'tourist',
    speedModifier: { DRIVE: 1.1, TRANSIT: 0.8, WALK: 1.15 },
    congestionFactor: 1.15,
    transitWaitTime: 720,
  },
  '여수': {
    type: 'tourist',
    speedModifier: { DRIVE: 1.1, TRANSIT: 0.8, WALK: 1.1 },
    congestionFactor: 1.1,
    transitWaitTime: 720,
  },
  '전주': {
    type: 'tourist',
    speedModifier: { DRIVE: 1.0, TRANSIT: 0.9, WALK: 1.2 },
    congestionFactor: 1.15,
    transitWaitTime: 600,
  },

  // 일반 도시
  '청주': {
    type: 'city',
    speedModifier: { DRIVE: 1.0, TRANSIT: 0.95, WALK: 1.0 },
    congestionFactor: 1.05,
    transitWaitTime: 600,
  },
  '천안': {
    type: 'city',
    speedModifier: { DRIVE: 1.0, TRANSIT: 0.95, WALK: 1.0 },
    congestionFactor: 1.05,
    transitWaitTime: 600,
  },
  '포항': {
    type: 'city',
    speedModifier: { DRIVE: 1.05, TRANSIT: 0.9, WALK: 1.0 },
    congestionFactor: 1.0,
    transitWaitTime: 600,
  },
  '창원': {
    type: 'city',
    speedModifier: { DRIVE: 1.0, TRANSIT: 0.95, WALK: 1.0 },
    congestionFactor: 1.05,
    transitWaitTime: 600,
  },
};

// 기본 프로파일 (매칭되지 않는 도시)
const defaultProfile: CityProfile = {
  type: 'city',
  speedModifier: { DRIVE: 1.0, TRANSIT: 1.0, WALK: 1.0 },
  congestionFactor: 1.0,
  transitWaitTime: 600, // 10분
};

/**
 * 목적지 문자열에서 도시 프로파일 추출
 * 예: "서울 강남", "부산 해운대" → 서울, 부산 프로파일
 */
export function getCityProfile(destination: string): CityProfile {
  if (!destination) return defaultProfile;
  
  const normalized = destination.trim();
  
  // 정확히 매칭되는 도시 찾기
  for (const [city, profile] of Object.entries(cityProfiles)) {
    if (normalized.includes(city)) {
      return profile;
    }
  }
  
  // 특수 케이스: 수도권 지역
  if (/강남|강북|마포|송파|강서|용산|종로|중구|성북|동대문|서대문/.test(normalized)) {
    return cityProfiles['서울'];
  }
  
  if (/성남|고양|용인|부천|안양|남양주|화성|평택/.test(normalized)) {
    return cityProfiles['경기'];
  }
  
  // 제주 세부 지역
  if (/서귀포|애월|조천/.test(normalized)) {
    return cityProfiles['제주'];
  }
  
  return defaultProfile;
}

/**
 * 프로파일 기반으로 속도 조정
 */
export function getAdjustedSpeed(
  baseSpeed: number,
  mode: 'DRIVE' | 'TRANSIT' | 'WALK',
  profile: CityProfile
): number {
  let adjusted = baseSpeed * profile.speedModifier[mode];
  
  // 차량/대중교통은 혼잡도 영향
  if (mode === 'DRIVE' || mode === 'TRANSIT') {
    adjusted = adjusted / profile.congestionFactor;
  }
  
  return adjusted;
}

/**
 * 프로파일에 따른 대중교통 대기시간
 */
export function getTransitWaitTime(profile: CityProfile): number {
  return profile.transitWaitTime;
}

/**
 * 도시 유형에 따른 추천 이동수단
 */
export function getRecommendedMode(profile: CityProfile): 'DRIVE' | 'TRANSIT' | 'WALK' {
  switch (profile.type) {
    case 'major-metro':
      return 'TRANSIT'; // 대도시는 대중교통 추천
    case 'metro':
      return 'TRANSIT';
    case 'tourist':
      return 'DRIVE'; // 관광지는 차량 이동
    case 'city':
      return 'DRIVE';
    case 'rural':
      return 'DRIVE';
    default:
      return 'DRIVE';
  }
}

/**
 * 사용자에게 표시할 도시 특성 설명
 */
export function getCityDescription(profile: CityProfile): string {
  switch (profile.type) {
    case 'major-metro':
      return '주요 대도시 (교통 혼잡, 대중교통 발달)';
    case 'metro':
      return '광역시 (대중교통 이용 권장)';
    case 'tourist':
      return '관광 도시 (도보/차량 추천)';
    case 'city':
      return '일반 도시';
    case 'rural':
      return '지방/시골 (차량 필수)';
    default:
      return '일반 지역';
  }
}
