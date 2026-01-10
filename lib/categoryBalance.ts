// lib/categoryBalance.ts
import type { Day, ItineraryItem } from '../types/trip';

// 카테고리 추출 (설명에서 "(카테고리: xxx)" 파싱)
export function extractCategory(item: ItineraryItem): string {
  const desc = (item.description || '').toLowerCase();
  const match = desc.match(/\(카테고리:\s*([^)]+)\)/i);
  if (match) return match[1].trim();
  
  // 폴백: 키워드 기반 추론
  const combined = (item.place + ' ' + desc).toLowerCase();
  if (/식당|맛집|음식|레스토랑/.test(combined)) return '식사';
  if (/카페|디저트|커피/.test(combined)) return '카페';
  if (/야경|나이트|저녁/.test(combined)) return '야경';
  if (/관광|체험|박물관|전망대|공원/.test(combined)) return '관광';
  
  return '기타';
}

// Day별 카테고리 분포 계산
export function getCategoryDistribution(day: Day): Record<string, number> {
  const dist: Record<string, number> = {};
  day.itinerary.forEach(item => {
    const cat = extractCategory(item);
    dist[cat] = (dist[cat] || 0) + 1;
  });
  return dist;
}

// 카테고리 균형 검증 및 권장사항
export function validateCategoryBalance(day: Day): { balanced: boolean; missing: string[] } {
  const dist = getCategoryDistribution(day);
  const required = ['식사', '관광', '카페'];
  const missing = required.filter(cat => !dist[cat] || dist[cat] === 0);
  
  // 최소 3개 카테고리 충족 여부
  const uniqueCategories = Object.keys(dist).filter(k => dist[k] > 0 && k !== '기타');
  const balanced = uniqueCategories.length >= 3 && missing.length === 0;
  
  return { balanced, missing };
}

// 일정 전체 카테고리 균형 보고서
export function generateBalanceReport(days: Day[]): string[] {
  const reports: string[] = [];
  days.forEach((day, idx) => {
    const { balanced, missing } = validateCategoryBalance(day);
    if (!balanced) {
      reports.push(`Day ${day.day}: 부족한 카테고리 - ${missing.join(', ')}`);
    }
  });
  return reports;
}

// 간단한 재배치 제안 (옵션)
// 실제 구현에서는 근처 장소 API를 활용해 부족한 카테고리의 장소를 추천할 수 있습니다.
export function suggestCategoryFix(day: Day): string[] {
  const { missing } = validateCategoryBalance(day);
  const suggestions: string[] = [];
  
  missing.forEach(cat => {
    switch (cat) {
      case '식사':
        suggestions.push('현지 맛집이나 레스토랑 추가를 고려하세요.');
        break;
      case '관광':
        suggestions.push('박물관, 전망대, 또는 명소 방문을 추가하세요.');
        break;
      case '카페':
        suggestions.push('휴식을 위한 카페나 디저트 장소를 추가하세요.');
        break;
      case '야경':
        suggestions.push('저녁 시간대 야경 명소를 추가하면 좋습니다.');
        break;
    }
  });
  
  return suggestions;
}
