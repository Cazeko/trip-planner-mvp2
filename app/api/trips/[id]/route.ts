// app/api/trips/[id]/route.ts (신규 파일)

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma, isDatabaseAvailable } from '../../../../lib/prisma';

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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isDatabaseAvailable()) {
      return NextResponse.json({ error: '데이터베이스가 설정되지 않았습니다.' }, { status: 503 });
    }

    const { id: tripId } = await params;
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    const decodedPayload = await verifyToken(token);
    if (!decodedPayload) {
      return NextResponse.json({ error: '인증 토큰이 유효하지 않습니다.' }, { status: 403 });
    }
    const { userId } = decodedPayload;

    // 삭제하려는 일정이 현재 로그인한 사용자의 것인지 확인하며 삭제
    const deleteResult = await prisma!.trip.deleteMany({
      where: {
        id: tripId,
        userId: userId,
      },
    });

    // 삭제된 항목이 없으면(소유자가 아니거나 ID가 잘못됨) 에러 반환
    if (deleteResult.count === 0) {
      return NextResponse.json({ error: '일정을 찾을 수 없거나 삭제할 권한이 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ message: '일정이 성공적으로 삭제되었습니다.' }, { status: 200 });

  } catch (error) {
    console.error('[API/TRIPS_DELETE_ERROR]', error);
    return NextResponse.json({ error: '일정 삭제 중 서버에 문제가 발생했습니다.' }, { status: 500 });
  }
}