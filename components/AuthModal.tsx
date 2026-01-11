// components/AuthModal.tsx (전체 수정)
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Mail, Lock, User, Chrome } from 'lucide-react';

interface AuthModalProps {
  onClose: () => void;
  onLoginSuccess: (token: string, autoLogin: boolean) => void;
}

export default function AuthModal({ onClose, onLoginSuccess }: AuthModalProps) {
  const [uiState, setUiState] = useState<'open' | 'closed'>('closed');
  const closeTimeoutRef = useRef<number | null>(null);

  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState(''); // 닉네임 상태 추가
  const [marketingConsent, setMarketingConsent] = useState(false); // 마케팅 동의
  const [autoLogin, setAutoLogin] = useState(false); // 자동 로그인
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setUiState('open'));
    return () => {
      window.cancelAnimationFrame(id);
      if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const requestClose = () => {
    setUiState('closed');
    closeTimeoutRef.current = window.setTimeout(() => onClose(), 220);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    const endpoint = isLoginMode ? '/api/login' : '/api/signup';
    // 회원가입 시 닉네임 포함
    const body = isLoginMode 
      ? JSON.stringify({ email, password })
      : JSON.stringify({ email, password, nickname, marketingConsent });

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '알 수 없는 오류가 발생했습니다.');

      if (isLoginMode) {
        onLoginSuccess(data.token, autoLogin);
      } else {
        setSuccessMessage('회원가입 성공! 이제 로그인해주세요.');
        setIsLoginMode(true);
        setPassword('');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = (provider: string) => {
    const remember = autoLogin ? '1' : '0';
    const p = provider.toLowerCase();
    window.location.href = `/api/oauth/${p}/start?remember=${remember}`;
  };

  const handlePasswordResetRequest = async () => {
    setError(null);
    setSuccessMessage(null);
    const trimmed = (email || '').trim();
    if (!trimmed) {
      setError('비밀번호 재설정을 위해 이메일을 먼저 입력해 주세요.');
      return;
    }
    try {
      setIsLoading(true);
      const resp = await fetch('/api/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setError(data?.error || '요청 처리 중 오류가 발생했습니다.');
        return;
      }
      setSuccessMessage('해당 이메일로 비밀번호 재설정 안내 메일을 보냈습니다. (가입된 계정이 있는 경우)');
    } finally {
      setIsLoading(false);
    }
  };

  const title = isLoginMode ? '로그인' : '회원가입';
  const subtitle = useMemo(() => {
    if (isLoginMode) return '이메일로 계속하거나 소셜로 시작하세요.';
    return '닉네임과 이메일로 빠르게 가입하세요.';
  }, [isLoginMode]);

  return (
    <div
      className="ios-modal-overlay fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 px-4"
      data-state={uiState}
      onClick={requestClose}
    >
      <div className="ios-modal-panel w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Card className="w-full rounded-2xl shadow-md border">
          <CardContent className="p-6 flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-semibold tracking-tight" style={{ color: '#171717' }}>{title}</h2>
              <p className="text-sm" style={{ color: '#64748b' }}>{subtitle}</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Email */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">이메일</Label>
                <div className="flex items-center gap-2 border border-[#e2e8f0] rounded-lg px-3 h-12">
                  <Mail className="h-5 w-5" style={{ color: '#64748b' }} />
                  <Input
                    id="email"
                    type="email"
                    placeholder="이메일을 입력하세요"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="border-0 shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>

              {/* Nickname (signup only) */}
              {!isLoginMode && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="nickname">닉네임</Label>
                  <div className="flex items-center gap-2 border border-[#e2e8f0] rounded-lg px-3 h-12">
                    <User className="h-5 w-5" style={{ color: '#64748b' }} />
                    <Input
                      id="nickname"
                      type="text"
                      placeholder="닉네임을 입력하세요"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      required
                      className="border-0 shadow-none focus-visible:ring-0"
                    />
                  </div>
                </div>
              )}

              {/* Password */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">비밀번호</Label>
                <div className="flex items-center gap-2 border border-[#e2e8f0] rounded-lg px-3 h-12">
                  <Lock className="h-5 w-5" style={{ color: '#64748b' }} />
                  <Input
                    id="password"
                    type="password"
                    placeholder="비밀번호(6자 이상)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="border-0 shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>

              {/* Remember / Marketing */}
              {isLoginMode ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="remember" checked={autoLogin} onCheckedChange={(v) => setAutoLogin(v === true)} />
                    <Label htmlFor="remember" className="text-sm font-normal">자동 로그인</Label>
                  </div>
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline"
                    onClick={handlePasswordResetRequest}
                    disabled={isLoading}
                  >
                    비밀번호 찾기
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Checkbox id="marketing" checked={marketingConsent} onCheckedChange={(v) => setMarketingConsent(v === true)} />
                  <Label htmlFor="marketing" className="text-sm font-normal">(선택) 이벤트 및 할인 정보 수신 동의</Label>
                </div>
              )}

              <Button type="submit" variant="default" className="w-full h-12 text-base font-medium rounded-lg" disabled={isLoading}>
                {isLoading ? '처리 중...' : (isLoginMode ? '로그인' : '가입하기')}
              </Button>
            </form>

            <div className="flex items-center gap-3" style={{ color: '#64748b' }}>
              <div className="h-px flex-1" style={{ backgroundColor: '#e2e8f0' }} />
              <span className="text-xs">또는</span>
              <div className="h-px flex-1" style={{ backgroundColor: '#e2e8f0' }} />
            </div>

            {/* Social */}
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 rounded-lg flex items-center justify-center gap-3"
                onClick={() => handleSocialLogin('google')}
              >
                <Chrome className="h-5 w-5" />
                Google로 시작하기
              </Button>
            </div>

            {error && (
              <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: '#e2e8f0', backgroundColor: '#f1f5f9', color: '#ef4444' }}>
                {error}
              </div>
            )}
            {successMessage && (
              <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: '#e2e8f0', backgroundColor: '#f1f5f9', color: '#171717' }}>
                {successMessage}
              </div>
            )}

            <p className="text-center text-sm" style={{ color: '#64748b' }}>
              {isLoginMode ? '계정이 없으신가요?' : '이미 계정이 있으신가요?'}{" "}
              <button
                type="button"
                className="hover:underline"
                style={{ color: '#2563eb' }}
                onClick={() => {
                  setIsLoginMode(!isLoginMode);
                  setError(null);
                  setSuccessMessage(null);
                }}
              >
                {isLoginMode ? '회원가입' : '로그인'}
              </button>
            </p>

            <Button type="button" variant="ghost" className="w-full" onClick={requestClose}>
              닫기
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}