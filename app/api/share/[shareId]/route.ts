import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '../../../../lib/prisma';

export async function GET(req: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  try {
    if (!isDatabaseAvailable()) {
      return NextResponse.json({ error: '데이터베이스가 설정되지 않았습니다.' }, { status: 503 });
    }

    const { shareId } = await params;

    if (!shareId) {
      return NextResponse.json({ error: 'Share ID가 필요합니다.' }, { status: 400 });
    }

    const trip = await prisma!.trip.findUnique({
      where: { shareId: shareId },
    });

    if (!trip) {
      return NextResponse.json({ error: '공유된 일정을 찾을 수 없습니다.' }, { status: 404 });
    }

    const publicTripData = {
      tripTitle: trip.tripTitle,
      destination: trip.destination,
      period: trip.period,
      keywords: trip.keywords,
      days: trip.daysJson,
    };

    return NextResponse.json(publicTripData, { status: 200 });

  } catch (error) {
    console.error('[API/SHARE_GET_ERROR]', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}