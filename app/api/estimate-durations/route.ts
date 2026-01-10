// app/api/estimate-durations/route.ts
import { NextRequest, NextResponse } from 'next/server';

type TravelMode = 'DRIVE' | 'WALK' | 'TRANSIT';

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
	const toRad = (v: number) => (v * Math.PI) / 180;
	const R = 6371000; // meters
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c; // meters
}

export async function POST(req: NextRequest) {
	try {
		const { itinerary = [], travelMode = 'DRIVE' }: { itinerary: any[]; travelMode: TravelMode } = await req.json();
		if (!Array.isArray(itinerary) || itinerary.length < 2) {
			return NextResponse.json({ legs: [] }, { status: 200 });
		}

		// Simple speed model (m/s)
		const speedMap: Record<TravelMode, number> = {
			DRIVE: 12, // ~43 km/h
			WALK: 1.4, // ~5 km/h
			TRANSIT: 8, // rough average
		};
		const speed = speedMap[travelMode] || speedMap.DRIVE;

		const legs = [] as { distanceMeters: number; durationSeconds: number }[];
		for (let i = 0; i < itinerary.length - 1; i++) {
			const a = itinerary[i];
			const b = itinerary[i + 1];
			const d = haversine(a.latitude, a.longitude, b.latitude, b.longitude);
			const t = d / speed; // seconds
			legs.push({ distanceMeters: Math.round(d), durationSeconds: Math.round(t) });
		}

		return NextResponse.json({ legs }, { status: 200 });
	} catch (e: any) {
		return NextResponse.json({ error: e.message || 'failed' }, { status: 500 });
	}
}

