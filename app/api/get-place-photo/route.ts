// app/api/get-place-photo/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const photoRef = searchParams.get('photoReference');
		const maxWidth = searchParams.get('maxWidth') || '800';
		const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_SERVER_API_KEY;
		if (!API_KEY || !photoRef) return NextResponse.json({ error: 'missing params' }, { status: 400 });

		const url = `https://places.googleapis.com/v1/${encodeURIComponent(photoRef)}/media?maxWidthPx=${maxWidth}&key=${API_KEY}`;
		const resp = await fetch(url);
		const buf = await resp.arrayBuffer();
		const contentType = resp.headers.get('content-type') || 'image/jpeg';
		return new NextResponse(Buffer.from(buf), { headers: { 'Content-Type': contentType } });
	} catch (e: any) {
		return NextResponse.json({ error: 'failed' }, { status: 500 });
	}
}

