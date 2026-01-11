import { TripData, Day, ItineraryItem } from '../types/trip';
import { estimateLegsLocal, TravelMode } from './scheduling';

export interface TripAnalysisMetrics {
  totalDistanceKm: number;
  totalTravelTimeMinutes: number;
  averageDailySpots: number;
  efficiencyScore: number; // 0-100
  fatigueScore: number; // 0-100 (Higher means more tired)
  fatigueLevel: 'Low' | 'Medium' | 'High';
  efficiencyLevel: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  dailyAnalysis: DailyAnalysis[];
}

export interface DailyAnalysis {
  day: number;
  distanceKm: number;
  travelTimeMinutes: number;
  spotsCount: number;
  efficiency: number;
  fatigue: number;
}

export function analyzeTrip(trip: TripData, travelMode: TravelMode = 'DRIVE'): TripAnalysisMetrics {
  const dailyAnalysis: DailyAnalysis[] = [];
  let totalDistanceMeters = 0;
  let totalTravelSeconds = 0;
  let totalSpots = 0;

  trip.days.forEach(day => {
    const legs = estimateLegsLocal(day.itinerary, travelMode, trip.destination);
    
    const dayDistanceMeters = legs.reduce((sum, leg) => sum + leg.distanceMeters, 0);
    const dayTravelSeconds = legs.reduce((sum, leg) => sum + leg.durationSeconds, 0);
    const spotsCount = day.itinerary.length;

    // Efficiency Calculation (Day)
    // Ideal: Travel time is < 20% of total active time (approx 10-12 hours)
    // Penalty if travel time > 2 hours/day
    let efficiency = 100;
    const travelMinutes = dayTravelSeconds / 60;
    
    if (travelMinutes > 120) efficiency -= (travelMinutes - 120) * 0.5; // -0.5 per min over 2h
    if (spotsCount > 0) {
        const avgTravelPerSpot = travelMinutes / spotsCount;
        if (avgTravelPerSpot > 45) efficiency -= (avgTravelPerSpot - 45); // Penalty for long hops
    }
    efficiency = Math.max(0, Math.min(100, efficiency));

    // Fatigue Calculation (Day)
    // Base fatigue from spots count
    let fatigue = 0;
    if (spotsCount <= 4) fatigue = 20;
    else if (spotsCount <= 6) fatigue = 50;
    else if (spotsCount <= 8) fatigue = 80;
    else fatigue = 100;

    // Add travel fatigue
    fatigue += (travelMinutes / 60) * 10; // +10 per hour of travel
    fatigue = Math.max(0, Math.min(100, fatigue));

    dailyAnalysis.push({
      day: day.day,
      distanceKm: Math.round(dayDistanceMeters / 100) / 10,
      travelTimeMinutes: Math.round(travelMinutes),
      spotsCount,
      efficiency: Math.round(efficiency),
      fatigue: Math.round(fatigue)
    });

    totalDistanceMeters += dayDistanceMeters;
    totalTravelSeconds += dayTravelSeconds;
    totalSpots += spotsCount;
  });

  const avgEfficiency = dailyAnalysis.reduce((sum, d) => sum + d.efficiency, 0) / (dailyAnalysis.length || 1);
  const avgFatigue = dailyAnalysis.reduce((sum, d) => sum + d.fatigue, 0) / (dailyAnalysis.length || 1);

  let efficiencyLevel: 'Excellent' | 'Good' | 'Fair' | 'Poor' = 'Good';
  if (avgEfficiency >= 90) efficiencyLevel = 'Excellent';
  else if (avgEfficiency >= 75) efficiencyLevel = 'Good';
  else if (avgEfficiency >= 50) efficiencyLevel = 'Fair';
  else efficiencyLevel = 'Poor';

  let fatigueLevel: 'Low' | 'Medium' | 'High' = 'Medium';
  if (avgFatigue < 40) fatigueLevel = 'Low';
  else if (avgFatigue < 75) fatigueLevel = 'Medium';
  else fatigueLevel = 'High';

  return {
    totalDistanceKm: Math.round(totalDistanceMeters / 100) / 10,
    totalTravelTimeMinutes: Math.round(totalTravelSeconds / 60),
    averageDailySpots: Math.round((totalSpots / (trip.days.length || 1)) * 10) / 10,
    efficiencyScore: Math.round(avgEfficiency),
    fatigueScore: Math.round(avgFatigue),
    efficiencyLevel,
    fatigueLevel,
    dailyAnalysis
  };
}
