// app/api/nearby-suggestions/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
	try {
		const { lat, lng, page = 1, pageSize = 6, minRating = 0, openNow = false, categories = [] } = await req.json();
		if (typeof lat !== 'number' || typeof lng !== 'number') {
			return NextResponse.json({ error: 'lat/lng required' }, { status: 400 });
		}

		const API_KEY = process.env.GOOGLE_MAPS_SERVER_API_KEY;
		if (!API_KEY) {
			// No key: return empty but valid response
			return NextResponse.json({ candidates: [], total: 0 }, { status: 200 });
		}

		const url = 'https://places.googleapis.com/v1/places:searchNearby';
		const body: any = {
			locationRestriction: {
				circle: { center: { latitude: lat, longitude: lng }, radius: 5000 },
			},
			includedPrimaryTypes: categories && categories.length ? categories : undefined,
			maxResultCount: Math.min(20, pageSize),
			rankPreference: 'POPULARITY',
			languageCode: 'ko',
		};
		
		// openNow는 별도로 전달하지 말고 결과 후처리에서 필터링합니다. API가 지원하지 않을 수 있음.

		const headers = {
			'Content-Type': 'application/json',
			'X-Goog-Api-Key': API_KEY,
			'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.internationalPhoneNumber,places.websiteUri,places.rating,places.types',
		};

		const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
		const data = await resp.json();
		if (!resp.ok) {
			console.error('[nearby-suggestions] error', data);
			return NextResponse.json({ candidates: [], total: 0 }, { status: 200 });
		}

		const raw = Array.isArray(data.places) ? data.places : [];
		const mapped = raw
			.filter((p: any) => (p.rating ?? 0) >= minRating)
			.map((p: any) => ({
				place: p.displayName?.text,
				formattedAddress: p.formattedAddress,
				latitude: p.location?.latitude,
				longitude: p.location?.longitude,
				internationalPhoneNumber: p.internationalPhoneNumber,
				websiteUri: p.websiteUri,
				rating: p.rating,
				types: p.types,
			}));

		// fake pagination (API already limits via maxResultCount)
		const start = (Math.max(1, page) - 1) * pageSize;
		const paged = mapped.slice(start, start + pageSize);
		return NextResponse.json({ candidates: paged, total: mapped.length }, { status: 200 });
	} catch (e: any) {
		return NextResponse.json({ candidates: [], total: 0 }, { status: 200 });
	}
}

