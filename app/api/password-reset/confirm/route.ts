import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { jwtVerify } from 'jose';
import { prisma, isDatabaseAvailable } from '../../../../lib/prisma';

async function verifyResetToken(token: string): Promise<{ userId: string; email: string } | null> {
	const JWT_SECRET = process.env.JWT_SECRET;
	if (!JWT_SECRET) throw new Error('JWT secret key is not defined.');
	const secretKey = new TextEncoder().encode(JWT_SECRET);

	const { payload } = await jwtVerify(token, secretKey);
	if (payload?.purpose !== 'password_reset') return null;

	const userId = payload?.userId;
	const email = payload?.email;
	if (typeof userId !== 'string' || typeof email !== 'string') return null;
	return { userId, email };
}

export async function POST(req: NextRequest) {
	try {
		if (!isDatabaseAvailable()) {
			return NextResponse.json({ error: '데이터베이스가 설정되지 않았습니다.' }, { status: 500 });
		}

		const body = await req.json().catch(() => ({}));
		const token = (body?.token || '').toString();
		const password = (body?.password || '').toString();

		if (!token) return NextResponse.json({ error: '토큰이 필요합니다.' }, { status: 400 });
		if (!password || password.length < 6) {
			return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 });
		}

		let claims: { userId: string; email: string } | null = null;
		try {
			claims = await verifyResetToken(token);
		} catch {
			claims = null;
		}
		if (!claims) return NextResponse.json({ error: '유효하지 않거나 만료된 링크입니다.' }, { status: 400 });

		const hashedPassword = await bcrypt.hash(password, 10);
		await prisma!.user.update({
			where: { id: claims.userId },
			data: { password: hashedPassword },
		});

		return NextResponse.json({ ok: true });
	} catch {
		return NextResponse.json({ error: '비밀번호 변경 처리 중 오류가 발생했습니다.' }, { status: 500 });
	}
}
