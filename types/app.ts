export interface SavedTrip {
  id: string;
  tripTitle: string;
  destination: string;
  period: string;
  keywords: string;
  daysJson: any;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  nickname: string;
}

export type ChatMsg = { role: 'user' | 'assistant'; content: string };

export type BudgetBreakdown = {
  식사: number;
  관광: number;
  숙박: number;
  기타: number;
};

export type BudgetDetection = {
  hasBudgetInfo: boolean;
  budget: number | null;
  budgetType: 'total' | 'per_person' | 'unknown' | null;
  personCount: number | null;
  totalBudget: number | null;
  breakdown: BudgetBreakdown | null;
  explanation: string | null;
};

export type Extracted = {
  destination?: string;
  period?: string;
  keywords?: string;
  travelType?: 'standard' | 'family' | 'couple' | 'roadtrip' | 'relaxed' | 'intense';
  include?: string;
  exclude?: string;
  preferredTransport?: 'DRIVE' | 'TRANSIT' | 'WALK';
  preferredTransportMulti?: Array<'DRIVE' | 'TRANSIT' | 'WALK'>;
};
