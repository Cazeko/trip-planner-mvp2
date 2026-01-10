// app/api/trips/[id]/share/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { nanoid } from 'nanoid';
import { prisma, isDatabaseAvailable } from '../../../../../lib/prisma';

interface UserJwtPayload {
  userId: string;
}

async function verifyToken(token: string): Promise<UserJwtPayload | null> {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) return null;
  try {
    const secretKey = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secretKey);
    return payload as unknown as UserJwtPayload;
  } catch (error) {
    return null;
  }
}

// POST: 공유 링크 생성
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isDatabaseAvailable()) {
      return NextResponse.json({ error: '데이터베이스가 설정되지 않았습니다.' }, { status: 503 });
    }

    const { id: tripId } = await params;
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: '유효하지 않은 토큰' }, { status: 403 });

    const trip = await prisma!.trip.findFirst({
      where: { id: tripId, userId: decoded.userId }
    });

    if (!trip) return NextResponse.json({ error: '일정을 찾을 수 없거나 권한이 없음' }, { status: 404 });
    
    let shareId = trip.shareId;
    if (!shareId) {
      shareId = nanoid(10);
      await prisma!.trip.update({
        where: { id: tripId },
        data: { shareId: shareId }
      });
    }

    return NextResponse.json({ shareId }, { status: 200 });

  } catch (error) {
    console.error('[API/SHARE_POST_ERROR]', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// DELETE: 공유 링크 비활성화
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isDatabaseAvailable()) {
      return NextResponse.json({ error: '데이터베이스가 설정되지 않았습니다.' }, { status: 503 });
    }

    const { id: tripId } = await params;
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: '유효하지 않은 토큰' }, { status: 403 });

    const updatedTrip = await prisma!.trip.updateMany({
      where: { id: tripId, userId: decoded.userId },
      data: { shareId: null }
    });

    if (updatedTrip.count === 0) {
      return NextResponse.json({ error: '일정을 찾을 수 없거나 권한이 없음' }, { status: 404 });
    }

    return NextResponse.json({ message: '공유가 비활성화되었습니다.' }, { status: 200 });

  } catch (error) {
    console.error('[API/SHARE_DELETE_ERROR]', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}