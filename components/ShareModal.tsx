// components/ShareModal.tsx
'use client';

import React, { useState } from 'react';

interface ShareModalProps {
  shareUrl: string;
  onClose: () => void;
}

export default function ShareModal({ shareUrl, onClose }: ShareModalProps) {
  const [copySuccess, setCopySuccess] = useState('');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopySuccess('✅ 링크가 복사되었습니다!');
      setTimeout(() => setCopySuccess(''), 2000);
    } catch (err) {
      setCopySuccess('❌ 복사에 실패했습니다.');
    }
  };

  const styles: { [key: string]: React.CSSProperties } = {
    overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modal: { background: '#ffffff', padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '500px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', color: '#000000' },
    title: { margin: '0 0 20px 0', fontSize: '22px', fontWeight: 'bold', textAlign: 'center', color: '#000000' },
    inputContainer: { display: 'flex', gap: '10px', marginTop: '10px' },
    input: { padding: '10px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '8px', flex: 1, background: '#ffffff', color: '#000000' },
    button: { padding: '10px 15px', fontSize: '14px', fontWeight: 'bold', color: 'white', backgroundColor: '#007bff', border: 'none', borderRadius: '8px', cursor: 'pointer' },
    copySuccessText: { marginTop: '10px', textAlign: 'center', color: '#28a745', height: '20px' }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>공유 링크 생성 완료 🔗</h2>
        <p>아래 링크를 통해 누구나 이 여행 일정을 볼 수 있습니다.</p>
        <div style={styles.inputContainer}>
          <input type="text" value={shareUrl} readOnly style={styles.input} />
          <button onClick={handleCopy} style={styles.button}>복사</button>
        </div>
        <p style={styles.copySuccessText}>{copySuccess}</p>
      </div>
    </div>
  );
}