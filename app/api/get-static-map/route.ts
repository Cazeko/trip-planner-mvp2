// app/api/get-static-map/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const center = searchParams.get('center');
		const zoom = searchParams.get('zoom') || '12';
		const size = searchParams.get('size') || '600x400';
		const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_SERVER_API_KEY;
		if (!API_KEY || !center) return NextResponse.json({ error: 'missing params' }, { status: 400 });

		const url = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(center)}&zoom=${zoom}&size=${size}&key=${API_KEY}`;
		const resp = await fetch(url);
		const buf = await resp.arrayBuffer();
		return new NextResponse(Buffer.from(buf), { headers: { 'Content-Type': 'image/png' } });
	} catch (e: any) {
		return NextResponse.json({ error: 'failed' }, { status: 500 });
	}
}

