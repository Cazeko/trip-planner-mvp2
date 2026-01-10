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

export type Extracted = {
  destination?: string;
  period?: string;
  keywords?: string;
  travelType?: 'standard' | 'family' | 'couple' | 'roadtrip' | 'relaxed' | 'intense';
  budgetMode?: 'economy' | 'standard' | 'premium';
  include?: string;
  exclude?: string;
  preferredTransport?: 'DRIVE' | 'TRANSIT' | 'WALK';
  preferredTransportMulti?: Array<'DRIVE' | 'TRANSIT' | 'WALK'>;
};
