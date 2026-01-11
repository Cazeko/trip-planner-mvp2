'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPasswordClient({ token }: { token: string }) {
	const router = useRouter();

	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setSuccess(null);

		if (!token) {
			setError('유효하지 않은 링크입니다. 다시 요청해 주세요.');
			return;
		}
		if (!password || password.length < 6) {
			setError('비밀번호는 6자 이상이어야 합니다.');
			return;
		}
		if (password !== confirm) {
			setError('비밀번호가 서로 일치하지 않습니다.');
			return;
		}

		try {
			setLoading(true);
			const resp = await fetch('/api/password-reset/confirm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token, password }),
			});
			const data = await resp.json().catch(() => ({}));
			if (!resp.ok) {
				setError(data?.error || '비밀번호 변경에 실패했습니다.');
				return;
			}
			setSuccess('비밀번호가 변경되었습니다. 로그인해 주세요.');
			setTimeout(() => router.replace('/'), 800);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-[100svh] flex items-center justify-center" style={{ backgroundColor: '#ffffff' }} px-4>
			<div className="w-full max-w-md">
				<Card className="w-full rounded-2xl shadow-md border">
					<CardContent className="p-6 flex flex-col gap-6">
						<div className="flex flex-col gap-1">
							<h1 className="text-2xl font-semibold tracking-tight" style={{ color: '#171717' }}>비밀번호 재설정</h1>
							<p className="text-sm" style={{ color: '#64748b' }}>새 비밀번호를 입력해 주세요.</p>
						</div>

						<form onSubmit={submit} className="flex flex-col gap-4">
							<div className="flex flex-col gap-2">
								<Label htmlFor="pw">새 비밀번호</Label>
								<Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6자 이상" />
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="pw2">새 비밀번호 확인</Label>
								<Input id="pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="한 번 더 입력" />
							</div>

							<Button type="submit" className="w-full h-12 rounded-lg" disabled={loading}>
								{loading ? '처리 중...' : '비밀번호 변경'}
							</Button>
						</form>

						{error && (
							<div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: '#e2e8f0', backgroundColor: '#f1f5f9', color: '#ef4444' }}>{error}</div>
						)}
						{success && (
							<div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: '#e2e8f0', backgroundColor: '#f1f5f9', color: '#171717' }}>{success}</div>
						)}

						<Button type="button" variant="ghost" className="w-full" onClick={() => router.replace('/')}
						>
							홈으로
						</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
