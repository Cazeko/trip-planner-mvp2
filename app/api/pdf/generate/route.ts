import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8001';
  const url = `${backendUrl.replace(/\/$/, '')}/pdf/generate`;

  try {
    const body = await req.text();
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers.get('content-type') || 'application/json',
      },
      body,
    });

    const arrayBuffer = await upstream.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/pdf',
        // allow browser download
        'Content-Disposition': upstream.headers.get('content-disposition') || 'inline; filename="tripdom.pdf"',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'PDF proxy failed', detail: String(err?.message || err) },
      { status: 502 }
    );
  }
}
