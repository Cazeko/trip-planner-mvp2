import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { SignJWT } from 'jose';
import { prisma, isDatabaseAvailable } from '../../../../../lib/prisma';

const PROVIDERS = new Set(['google', 'kakao']);

function getBaseUrl(req: NextRequest): string {
	return process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
}

function secureCookie(req: NextRequest): boolean {
	const baseUrl = getBaseUrl(req);
	return baseUrl.startsWith('https://');
}

function sanitizeNickname(input: string): string {
	const s = (input || '').toString().trim();
	if (!s) return '사용자';
	// 너무 공격적으로 제한하지 않고, 길이만 제한
	return s.slice(0, 20);
}

async function ensureUniqueNickname(base: string): Promise<string> {
	const seed = sanitizeNickname(base);
	let candidate = seed;
	let suffix = 0;
	while (true) {
		const exists = await prisma!.user.findUnique({ where: { nickname: candidate } });
		if (!exists) return candidate;
		suffix += 1;
		candidate = `${seed}${suffix}`.slice(0, 20);
	}
}

async function issueJwt(user: { id: string; email: string; nickname: string }): Promise<string> {
	const JWT_SECRET = process.env.JWT_SECRET;
	if (!JWT_SECRET) throw new Error('JWT secret key is not defined.');
	const secretKey = new TextEncoder().encode(JWT_SECRET);
	return await new SignJWT({ userId: user.id, email: user.email, nickname: user.nickname })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('1h')
		.sign(secretKey);
}

export async function GET(
	req: NextRequest,
	context: { params: Promise<{ provider: string }> }
) {
	const params = await context.params;
	const provider = (params?.provider || '').toLowerCase();
	const baseUrl = getBaseUrl(req);
	const toHome = new URL(baseUrl);

	try {
		if (!PROVIDERS.has(provider)) {
			toHome.searchParams.set('oauthError', '지원하지 않는 provider 입니다.');
			return NextResponse.redirect(toHome);
		}
		if (!isDatabaseAvailable()) {
			toHome.searchParams.set('oauthError', '데이터베이스가 설정되지 않았습니다.');
			return NextResponse.redirect(toHome);
		}

		const code = req.nextUrl.searchParams.get('code');
		const state = req.nextUrl.searchParams.get('state');
		if (!code || !state) {
			toHome.searchParams.set('oauthError', 'OAuth 응답이 올바르지 않습니다.');
			return NextResponse.redirect(toHome);
		}

		const stateCookieName = `tp_oauth_state_${provider}`;
		const rememberCookieName = `tp_oauth_remember_${provider}`;
		const expectedState = req.cookies.get(stateCookieName)?.value;
		const remember = req.cookies.get(rememberCookieName)?.value === '1' ? '1' : '0';

		if (!expectedState || expectedState !== state) {
			toHome.searchParams.set('oauthError', 'OAuth state 검증에 실패했습니다.');
			return NextResponse.redirect(toHome);
		}

		const redirectUri = `${baseUrl}/api/oauth/${provider}/callback`;

		let email: string | undefined;
		let nickname: string | undefined;

		if (provider === 'google') {
			const clientId = process.env.GOOGLE_CLIENT_ID;
			const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
			if (!clientId || !clientSecret) {
				toHome.searchParams.set('oauthError', 'Google OAuth 환경변수가 설정되지 않았습니다.');
				return NextResponse.redirect(toHome);
			}

			const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					code,
					client_id: clientId,
					client_secret: clientSecret,
					redirect_uri: redirectUri,
					grant_type: 'authorization_code',
				}).toString(),
			});
			const tokenJson: any = await tokenResp.json().catch(() => ({}));
			if (!tokenResp.ok || !tokenJson?.access_token) {
				toHome.searchParams.set('oauthError', 'Google 토큰 발급에 실패했습니다.');
				return NextResponse.redirect(toHome);
			}

			const infoResp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
				headers: { Authorization: `Bearer ${tokenJson.access_token}` },
			});
			const info: any = await infoResp.json().catch(() => ({}));
			email = info?.email;
			nickname = info?.name || info?.given_name || (email ? email.split('@')[0] : undefined);
		} else {
			const clientId = process.env.KAKAO_CLIENT_ID;
			const clientSecret = process.env.KAKAO_CLIENT_SECRET;
			if (!clientId) {
				toHome.searchParams.set('oauthError', 'Kakao OAuth 환경변수가 설정되지 않았습니다.');
				return NextResponse.redirect(toHome);
			}

			const tokenResp = await fetch('https://kauth.kakao.com/oauth/token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					grant_type: 'authorization_code',
					client_id: clientId,
					...(clientSecret ? { client_secret: clientSecret } : {}),
					redirect_uri: redirectUri,
					code,
				}).toString(),
			});
			const tokenJson: any = await tokenResp.json().catch(() => ({}));
			if (!tokenResp.ok || !tokenJson?.access_token) {
				toHome.searchParams.set('oauthError', 'Kakao 토큰 발급에 실패했습니다.');
				return NextResponse.redirect(toHome);
			}

			const meResp = await fetch('https://kapi.kakao.com/v2/user/me', {
				headers: { Authorization: `Bearer ${tokenJson.access_token}` },
			});
			const me: any = await meResp.json().catch(() => ({}));
			email = me?.kakao_account?.email;
			nickname = me?.kakao_account?.profile?.nickname || me?.properties?.nickname || (email ? email.split('@')[0] : undefined);
		}

		if (!email) {
			toHome.searchParams.set('oauthError', '이메일 정보를 가져오지 못했습니다. (동의 항목: 이메일)');
			return NextResponse.redirect(toHome);
		}

		let user = await prisma!.user.findUnique({ where: { email } });
		if (!user) {
			const baseNick = nickname || email.split('@')[0] || '사용자';
			const uniqueNick = await ensureUniqueNickname(baseNick);
			const randomPassword = crypto.randomBytes(32).toString('hex');
			const hashedPassword = await bcrypt.hash(randomPassword, 10);
			user = await prisma!.user.create({
				data: {
					email,
					password: hashedPassword,
					nickname: uniqueNick,
					marketingConsent: false,
				},
			});
		}

		const token = await issueJwt({ id: user.id, email: user.email, nickname: user.nickname });
		toHome.searchParams.set('token', token);
		toHome.searchParams.set('remember', remember);

		const res = NextResponse.redirect(toHome);
		const secure = secureCookie(req);
		res.cookies.set(stateCookieName, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 });
		res.cookies.set(rememberCookieName, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 });
		return res;
	} catch (e) {
		toHome.searchParams.set('oauthError', '소셜 로그인 처리 중 오류가 발생했습니다.');
		return NextResponse.redirect(toHome);
	}
}
