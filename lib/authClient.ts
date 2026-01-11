// lib/authClient.ts

export function getStoredToken(): string | null {
	if (typeof window === 'undefined') return null;
	return (
		localStorage.getItem('trip-planner-token') ||
		sessionStorage.getItem('trip-planner-token')
	);
}

export function clearStoredToken(): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.removeItem('trip-planner-token');
		localStorage.removeItem('trip-planner-remember');
		sessionStorage.removeItem('trip-planner-token');
	} catch {
		// no-op
	}
}

export async function ensureFreshToken(): Promise<void> {
	if (typeof window === 'undefined') return;
	try {
		const resp = await authFetch('/api/refresh', { method: 'POST' });
		if (resp.ok) {
			const data = await resp.json().catch(() => ({}));
			if (data && typeof data.token === 'string') {
				const remember = localStorage.getItem('trip-planner-remember') === '1';
				if (remember) localStorage.setItem('trip-planner-token', data.token);
				else sessionStorage.setItem('trip-planner-token', data.token);
			}
		}
	} catch {
		// ignore refresh errors; token may be obtained on login
	}
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
	let token = getStoredToken();
	const makeHeaders = (t: string | null) => {
		const h = new Headers(init.headers || {});
		if (t) h.set('Authorization', `Bearer ${t}`);
		return h;
	};

	let resp = await fetch(input, { ...init, headers: makeHeaders(token) });

	// 401 Unauthorized 발생 시 토큰 갱신 시도
	if (resp.status === 401) {
		await ensureFreshToken();
		token = getStoredToken();
		if (token) {
			// 새 토큰으로 재시도
			resp = await fetch(input, { ...init, headers: makeHeaders(token) });
		}
	}

	return resp;
}

