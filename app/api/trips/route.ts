// app/api/trips/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose'
import { prisma, isDatabaseAvailable } from '../../../lib/prisma';

// JWT 페이로드에 대한 타입 정의
interface UserJwtPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

async function verifyToken(token: string): Promise<UserJwtPayload | null> {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) return null;

  try {
    const secretKey = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secretKey);
    return payload as unknown as UserJwtPayload;
  } catch (error) {
    console.error("JWT Verification failed:", error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    // DB 체크
    if (!isDatabaseAvailable()) {
      return NextResponse.json({ 
        error: '데이터베이스가 설정되지 않았습니다. 로컬 저장소를 사용해주세요.' 
      }, { status: 503 });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    const decodedPayload = await verifyToken(token); // 새로 만든 함수 사용
    if (!decodedPayload) {
      return NextResponse.json({ error: '인증 토큰이 유효하지 않습니다.' }, { status: 403 });
    }
    const { userId } = decodedPayload;

    // 3. 요청 본문에서 여행 데이터를 가져옵니다.
    const { tripTitle, destination, period, keywords, daysJson } = await req.json();

    if (!tripTitle || !destination || !period || !keywords || !daysJson) {
      return NextResponse.json({ error: '필수 여행 정보가 누락되었습니다.' }, { status: 400 });
    }

    // 4. Prisma를 사용하여 데이터베이스에 새로운 여행 일정을 생성합니다.
    const newTrip = await prisma!.trip.create({
      data: {
        userId: userId, // 토큰에서 얻은 userId와 연결
        tripTitle,
        destination,
        period,
        keywords,
        daysJson, // 여행의 상세 내용은 JSON 형태로 저장
      },
    });

    return NextResponse.json({ message: '여행 일정이 성공적으로 저장되었습니다.', trip: newTrip }, { status: 201 });

  } catch (error) {
    console.error('[API/TRIPS_POST_ERROR]', error);
    return NextResponse.json({ error: '일정 저장 중 서버에 문제가 발생했습니다.' }, { status: 500 });
  }
}

// app/api/trips/route.ts 파일에 이 GET 함수를 추가하세요.

export async function GET(req: NextRequest) {
  try {
    // DB 체크
    if (!isDatabaseAvailable()) {
      return NextResponse.json([], { status: 200 }); // 빈 배열 반환
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    const decodedPayload = await verifyToken(token); // 새로 만든 함수 사용
    if (!decodedPayload) {
      return NextResponse.json({ error: '인증 토큰이 유효하지 않습니다.' }, { status: 403 });
    }
    const { userId } = decodedPayload;

    // 2. Prisma를 사용하여 해당 사용자의 모든 여행 일정을 찾습니다.
    // createdAt을 기준으로 내림차순 정렬하여 최신순으로 보여줍니다.
    const trips = await prisma!.trip.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // 3. 찾은 여행 일정 목록을 반환합니다.
    return NextResponse.json(trips, { status: 200 });

  } catch (error) {
    console.error('[API/TRIPS_GET_ERROR]', error);
    return NextResponse.json({ error: '일정 목록을 불러오는 중 서버에 문제가 발생했습니다.' }, { status: 500 });
  }
}