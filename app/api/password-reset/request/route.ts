import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { prisma, isDatabaseAvailable } from '../../../../lib/prisma';
import { sendMail } from '../../../../lib/mailer';

function getBaseUrl(req: NextRequest): string {
	return process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
}

async function issueResetToken(payload: { userId: string; email: string }): Promise<string> {
	const JWT_SECRET = process.env.JWT_SECRET;
	if (!JWT_SECRET) throw new Error('JWT secret key is not defined.');
	const secretKey = new TextEncoder().encode(JWT_SECRET);

	return await new SignJWT({
		userId: payload.userId,
		email: payload.email,
		purpose: 'password_reset',
	})
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('15m')
		.sign(secretKey);
}

export async function POST(req: NextRequest) {
	try {
		if (!isDatabaseAvailable()) {
			return NextResponse.json({ error: '데이터베이스가 설정되지 않았습니다.' }, { status: 500 });
		}

		const body = await req.json().catch(() => ({}));
		const email = (body?.email || '').toString().trim().toLowerCase();
		if (!email) {
			return NextResponse.json({ error: '이메일을 입력해 주세요.' }, { status: 400 });
		}

		const user = await prisma!.user.findUnique({ where: { email } });
		// 계정 존재 여부를 노출하지 않기 위해 항상 200을 반환합니다.
		if (!user) {
			return NextResponse.json({ ok: true });
		}

		const token = await issueResetToken({ userId: user.id, email: user.email });
		const baseUrl = getBaseUrl(req);
		const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

		const subject = '[Trip Planner] 비밀번호 재설정 안내';
		const text = `아래 링크에서 비밀번호를 재설정할 수 있습니다.\n\n${resetUrl}\n\n이 링크는 15분 후 만료됩니다.`;
		const html = `
			<p>아래 링크에서 비밀번호를 재설정할 수 있습니다.</p>
			<p><a href="${resetUrl}">비밀번호 재설정하기</a></p>
			<p style="color:#64748b;font-size:12px;">이 링크는 15분 후 만료됩니다.</p>
		`;

		const sent = await sendMail({ to: user.email, subject, text, html });
		if (!sent.ok) {
			if (process.env.NODE_ENV !== 'production') {
				console.info('[password-reset] resetUrl:', resetUrl);
			}
			return NextResponse.json({ error: sent.error }, { status: 500 });
		}

		return NextResponse.json({ ok: true });
	} catch {
		return NextResponse.json({ error: '비밀번호 재설정 요청 처리 중 오류가 발생했습니다.' }, { status: 500 });
	}
}
