import { useCallback } from 'react';
import type { BudgetDetection } from '../types/app';

/**
 * 사용자의 채팅 입력에서 예산 정보를 감지합니다.
 */
export function useBudgetDetection(tripDays: number = 3) {
  const detectBudget = useCallback(async (message: string): Promise<BudgetDetection | null> => {
    try {
      const res = await fetch('/api/detect-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, tripDays }),
      });

      if (!res.ok) {
        console.error('[Budget Detection Error]', res.statusText);
        return null;
      }

      const data: BudgetDetection = await res.json();
      return data;
    } catch (error) {
      console.error('[Budget Detection Network Error]', error);
      return null;
    }
  }, [tripDays]);

  return { detectBudget };
}
