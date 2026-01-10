// app/api/refresh/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, SignJWT, decodeJwt } from 'jose';
import { prisma, isDatabaseAvailable } from '../../../lib/prisma';

export async function POST(req: NextRequest) {
	try {
		if (!isDatabaseAvailable()) {
			return NextResponse.json({}, { status: 200 }); // DB 없으면 조용히 종료
		}

		const authHeader = req.headers.get('Authorization');
		const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
		if (!token) return NextResponse.json({}, { status: 200 }); // 토큰 없으면 조용히 종료

		const JWT_SECRET = process.env.JWT_SECRET;
		if (!JWT_SECRET) return NextResponse.json({}, { status: 200 });
		const secretKey = new TextEncoder().encode(JWT_SECRET);

		let payload: any | null = null;
		let valid = false;
		try {
			// 기존 토큰 검증 (만료 허용 오차 60초)
			const verified = await jwtVerify(token, secretKey, { clockTolerance: 60 });
			payload = verified.payload as any;
			valid = true;
		} catch (e: any) {
			// 만료된 경우에도 payload를 파싱해서 제한적으로 재발급 허용
			if (e?.code === 'ERR_JWT_EXPIRED') {
				payload = decodeJwt(token) as any;
			} else {
				return NextResponse.json({}, { status: 200 });
			}
		}

		if (!payload?.userId) return NextResponse.json({}, { status: 200 });

		// 사용자 존재 여부 확인 (간단 검증)
		const user = await prisma!.user.findUnique({ where: { id: payload.userId } });
		if (!user) return NextResponse.json({}, { status: 200 });

		// 재발급 기준: 유효하지만 만료 임박(<=20분)하거나 만료된 경우 모두 새 토큰 발급
		const nowSec = Math.floor(Date.now() / 1000);
		const expSec = Number(payload?.exp || 0);
		const shouldRefresh = !valid || (expSec - nowSec <= 20 * 60);

		if (!shouldRefresh) return NextResponse.json({}, { status: 200 });

		const newPayload = {
			userId: user.id,
			email: user.email,
			nickname: user.nickname,
		};
		const newToken = await new SignJWT(newPayload)
			.setProtectedHeader({ alg: 'HS256' })
			.setIssuedAt()
			.setExpirationTime('1h')
			.sign(secretKey);

		return NextResponse.json({ token: newToken }, { status: 200 });
	} catch {
		return NextResponse.json({}, { status: 200 });
	}
}

