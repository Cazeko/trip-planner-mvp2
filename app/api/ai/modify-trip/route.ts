// app/api/ai/modify-trip/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const base = process.env.FASTAPI_URL || 'http://127.0.0.1:8001';
    const r = await fetch(`${base}/ai/modify-trip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'proxy failed' }, { status: 500 });
  }
}
