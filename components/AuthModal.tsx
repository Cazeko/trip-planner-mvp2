// components/AuthModal.tsx (전체 수정)
'use client';

import React, { useState } from 'react';

interface AuthModalProps {
  onClose: () => void;
  onLoginSuccess: (token: string, autoLogin: boolean) => void;
}

export default function AuthModal({ onClose, onLoginSuccess }: AuthModalProps) {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState(''); // 닉네임 상태 추가
  const [autoLogin, setAutoLogin] = useState(false); // 자동 로그인
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    const endpoint = isLoginMode ? '/api/login' : '/api/signup';
    // 회원가입 시 닉네임 포함
    const body = isLoginMode 
      ? JSON.stringify({ email, password })
      : JSON.stringify({ email, password, nickname });

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

  const styles: { [key: string]: React.CSSProperties } = { /* 스타일은 기존과 동일 */ 
    overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modal: { background: 'white', padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '400px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', color: '#000' },
    title: { margin: '0 0 20px 0', fontSize: '24px', fontWeight: 'bold', textAlign: 'center', color: '#000' },
    form: { display: 'flex', flexDirection: 'column', gap: '15px' },
    input: { padding: '12px', fontSize: '16px', border: '1px solid #ccc', borderRadius: '8px', color: '#000' },
    button: { padding: '12px', fontSize: '16px', fontWeight: 'bold', color: 'white', backgroundColor: '#007bff', border: 'none', borderRadius: '8px', cursor: 'pointer' },
    toggleText: { marginTop: '15px', textAlign: 'center', fontSize: '14px', color: '#000' },
    toggleLink: { color: '#007bff', cursor: 'pointer', fontWeight: 'bold', marginLeft: '5px' },
    error: { color: '#dc3545', background: '#f8d7da', padding: '10px', borderRadius: '8px', textAlign: 'center', marginTop: '10px' },
    success: { color: '#155724', background: '#d4edda', padding: '10px', borderRadius: '8px', textAlign: 'center', marginTop: '10px' },
    row: { display: 'flex', alignItems: 'center', gap: '8px' },
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>{isLoginMode ? '로그인' : '회원가입'}</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" required style={styles.input} />
          
          {/* 회원가입 모드일 때만 닉네임 입력창 표시 */}
          {!isLoginMode && (
            <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="닉네임" required style={styles.input} />
          )}

          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호 (6자 이상)" required style={styles.input} />
          {/* 로그인 모드에서 자동 로그인 옵션 */}
          {isLoginMode && (
            <label style={styles.row}>
              <input type="checkbox" checked={autoLogin} onChange={(e) => setAutoLogin(e.target.checked)} />
              자동 로그인
            </label>
          )}
          <button type="submit" disabled={isLoading} style={styles.button}>
            {isLoading ? '처리 중...' : (isLoginMode ? '로그인' : '가입하기')}
          </button>
        </form>
        {error && <p style={styles.error}>{error}</p>}
        {successMessage && <p style={styles.success}>{successMessage}</p>}
        <p style={styles.toggleText}>
          {isLoginMode ? '계정이 없으신가요?' : '이미 계정이 있으신가요?'}
          <span style={styles.toggleLink} onClick={() => { setIsLoginMode(!isLoginMode); setError(null); setSuccessMessage(null); }}>
            {isLoginMode ? '회원가입' : '로그인'}
          </span>
        </p>
      </div>
    </div>
  );
}