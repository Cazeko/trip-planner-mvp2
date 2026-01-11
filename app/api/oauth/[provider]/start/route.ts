import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const PROVIDERS = new Set(['google', 'kakao']);

function getBaseUrl(req: NextRequest): string {
	let url = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
	// Remove all trailing slashes to prevent double slashes in redirect URI
	while (url.endsWith('/')) {
		url = url.slice(0, -1);
	}
	return url;
}

function secureCookie(req: NextRequest): boolean {
	const baseUrl = getBaseUrl(req);
	return baseUrl.startsWith('https://');
}

export async function GET(
	req: NextRequest,
	context: { params: Promise<{ provider: string }> }
) {
	const params = await context.params;
	const provider = (params?.provider || '').toLowerCase();
	if (!PROVIDERS.has(provider)) {
		return NextResponse.json({ error: '지원하지 않는 provider 입니다.' }, { status: 400 });
	}

	const remember = req.nextUrl.searchParams.get('remember') === '1' ? '1' : '0';
	const state = crypto.randomBytes(18).toString('hex');

	const baseUrl = getBaseUrl(req);
	const redirectUri = `${baseUrl}/api/oauth/${provider}/callback`;

	let authUrl: string;
	if (provider === 'google') {
		const clientId = process.env.GOOGLE_CLIENT_ID;
		if (!clientId) return NextResponse.json({ error: 'GOOGLE_CLIENT_ID가 설정되지 않았습니다.' }, { status: 500 });
		const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
		u.searchParams.set('client_id', clientId);
		u.searchParams.set('redirect_uri', redirectUri);
		u.searchParams.set('response_type', 'code');
		u.searchParams.set('scope', 'openid email profile');
		u.searchParams.set('state', state);
		u.searchParams.set('prompt', 'select_account');
		authUrl = u.toString();
	} else {
		const clientId = process.env.KAKAO_CLIENT_ID;
		if (!clientId) return NextResponse.json({ error: 'KAKAO_CLIENT_ID가 설정되지 않았습니다.' }, { status: 500 });
		const u = new URL('https://kauth.kakao.com/oauth/authorize');
		u.searchParams.set('client_id', clientId);
		u.searchParams.set('redirect_uri', redirectUri);
		u.searchParams.set('response_type', 'code');
		u.searchParams.set('state', state);
		// email을 받으려면 사용자 동의가 필요합니다.
		u.searchParams.set('scope', 'account_email profile_nickname');
		authUrl = u.toString();
	}

	const res = NextResponse.redirect(authUrl);
	const secure = secureCookie(req);
	res.cookies.set(`tp_oauth_state_${provider}`, state, {
		httpOnly: true,
		secure,
		sameSite: 'lax',
		path: '/',
		maxAge: 60 * 10,
	});
	res.cookies.set(`tp_oauth_remember_${provider}`, remember, {
		httpOnly: true,
		secure,
		sameSite: 'lax',
		path: '/',
		maxAge: 60 * 10,
	});
	return res;
}
