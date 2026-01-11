// app/api/nearby-suggestions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
	try {
		const { lat, lng, page = 1, pageSize = 6, minRating = 0, openNow = false, categories = [], basePlaceName, baseTypes } = await req.json();
		if (typeof lat !== 'number' || typeof lng !== 'number') {
			return NextResponse.json({ error: 'lat/lng required' }, { status: 400 });
		}

		const API_KEY = process.env.GOOGLE_MAPS_SERVER_API_KEY;
		if (!API_KEY) {
			return NextResponse.json({ candidates: [], total: 0 }, { status: 200 });
		}

		// 1. Google Places API로 후보군 검색
		const url = 'https://places.googleapis.com/v1/places:searchNearby';
		const body: any = {
			locationRestriction: {
				circle: { center: { latitude: lat, longitude: lng }, radius: 2000 }, // 2km 반경
			},
			includedPrimaryTypes: categories && categories.length ? categories : undefined,
			maxResultCount: 20, // GPT 분석을 위해 넉넉히 가져옴
			rankPreference: 'POPULARITY',
			languageCode: 'ko',
		};

		const headers = {
			'Content-Type': 'application/json',
			'X-Goog-Api-Key': API_KEY,
			'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.internationalPhoneNumber,places.websiteUri,places.rating,places.types,places.userRatingCount',
		};

		const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
		const data = await resp.json();
		
		if (!resp.ok) {
			console.error('[nearby-suggestions] error', data);
			return NextResponse.json({ candidates: [], total: 0 }, { status: 200 });
		}

		let raw = Array.isArray(data.places) ? data.places : [];
		
		// 기본 필터링
		raw = raw.filter((p: any) => (p.rating ?? 0) >= minRating);
		
		// 2. GPT를 이용한 스마트 큐레이션 (Concierge Service)
		// 상위 10개 정도만 추려서 GPT에게 분석 요청 (토큰 절약 및 속도)
		const candidatesForAI = raw.slice(0, 10).map((p: any) => ({
			name: p.displayName?.text,
			rating: p.rating,
			types: p.types,
			reviews: p.userRatingCount
		}));

		let enrichedResults = raw.map((p: any) => ({
			place: p.displayName?.text,
			formattedAddress: p.formattedAddress,
			latitude: p.location?.latitude,
			longitude: p.location?.longitude,
			internationalPhoneNumber: p.internationalPhoneNumber,
			websiteUri: p.websiteUri,
			rating: p.rating,
			types: p.types,
			reason: '' // 초기값
		}));

		if (basePlaceName && candidatesForAI.length > 0) {
			try {
				const prompt = `
You are a travel concierge. The user wants to replace "${basePlaceName}" with a better alternative nearby.
Candidates: ${JSON.stringify(candidatesForAI)}

Task:
1. Analyze the candidates.
2. Select the best ones (up to 6).
3. For each selected candidate, provide a short, persuasive "reason" in Korean (e.g., "현지인에게 더 인기 있는 맛집", "평점이 더 높은 카페", "조용한 분위기").
4. If the candidate is very similar to the original, highlight why it might be a good alternative (e.g. "웨이팅이 적은 대안").

Output JSON:
{
  "recommendations": [
    { "name": "Candidate Name", "reason": "Reason string" }
  ]
}
`;
				const aiResp = await openai.chat.completions.create({
					model: "gpt-4o-mini",
					messages: [{ role: "system", content: prompt }],
					response_format: { type: "json_object" },
					temperature: 0.5,
				});

				const aiContent = JSON.parse(aiResp.choices[0].message.content || '{}');
				const recommendations = aiContent.recommendations || [];

				// AI 추천 사유 매핑 및 정렬
				enrichedResults = enrichedResults.map((item: any) => {
					const rec = recommendations.find((r: any) => r.name === item.place);
					return rec ? { ...item, reason: rec.reason, isRecommended: true } : item;
				});

				// 추천된 항목을 위로 올림
				enrichedResults.sort((a: any, b: any) => (b.isRecommended ? 1 : 0) - (a.isRecommended ? 1 : 0));
			} catch (e) {
				console.error('[nearby-suggestions] AI curation failed', e);
				// AI 실패 시 평점순 정렬 유지
			}
		}

		// Pagination
		const start = (Math.max(1, page) - 1) * pageSize;
		const paged = enrichedResults.slice(start, start + pageSize);

		return NextResponse.json({ candidates: paged, total: enrichedResults.length }, { status: 200 });
	} catch (e: any) {
		console.error('[nearby-suggestions] fatal error', e);
		return NextResponse.json({ candidates: [], total: 0 }, { status: 200 });
	}
}

