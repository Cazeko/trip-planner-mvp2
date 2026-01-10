import React from 'react';
import type { TripData } from '../types/trip';

type TripSummaryMeta = {
  destination?: string;
  period?: string;
  travelType?: string;
  budgetMode?: string;
  keywords?: string;
  preferredTransport?: 'DRIVE' | 'TRANSIT' | 'WALK';
  preferredTransportMulti?: Array<'DRIVE' | 'TRANSIT' | 'WALK'>;
};

type TripSummaryBarProps = {
  trip: TripData;
  meta: TripSummaryMeta;
  budget: { total: number; perDay: number[] };
  travelMode: string;
  status: { ready: boolean; busy: boolean; isLoading: boolean; error?: string | null };
  restoredFromLocal: boolean;
  onDismissRestore: () => void;
  onClearError: () => void;
};

const transportLabel = (mode: string) => {
  switch (mode) {
    case 'DRIVE':
      return '차량';
    case 'TRANSIT':
      return '대중교통';
    case 'WALK':
      return '도보';
    default:
      return mode;
  }
};

const travelTypeLabel = (type?: string) => {
  if (!type) return '미지정';
  const dict: Record<string, string> = {
    standard: '표준',
    family: '가족',
    couple: '커플',
    roadtrip: '로드트립',
    relaxed: '여유형',
    intense: '탐험형',
  };
  return dict[type] || type;
};

const budgetModeLabel = (mode?: string) => {
  if (!mode) return '미지정';
  const dict: Record<string, string> = {
    economy: '실속',
    standard: '일반',
    premium: '프리미엄',
  };
  return dict[mode] || mode;
};

const TripSummaryBar: React.FC<TripSummaryBarProps> = ({
  trip,
  meta,
  budget,
  travelMode,
  status,
  restoredFromLocal,
  onDismissRestore,
  onClearError,
}) => {
  const transports = (meta.preferredTransportMulti?.length ? meta.preferredTransportMulti : meta.preferredTransport ? [meta.preferredTransport] : [travelMode]).map(transportLabel);
  const statusInfo = (() => {
    if (status.error) {
      return { label: '오류 발생', color: '#c92a2a', background: '#fff5f5' };
    }
    if (status.isLoading) {
      return { label: 'AI가 일정을 생성 중입니다', color: '#0d6efd', background: '#e7f1ff' };
    }
    if (status.busy) {
      return { label: 'AI가 요청을 처리하는 중입니다', color: '#0d6efd', background: '#e7f1ff' };
    }
    if (status.ready) {
      return { label: '생성 준비 완료', color: '#0f5132', background: '#d1e7dd' };
    }
    return { label: '정보를 더 알려주세요', color: '#6c757d', background: '#f4f5f7' };
  })();

  return (
    <div style={styles.wrapper}>
      <div style={styles.topRow}>
        <div>
          <p style={styles.tripTitle}>{trip.tripTitle}</p>
          <p style={styles.metaLine}>
            📍 {meta.destination || trip.destination} · 🗓️ {meta.period || trip.period}
          </p>
          {meta.keywords && <p style={styles.keywords}>🏷️ {meta.keywords}</p>}
        </div>
        <div style={{ ...styles.statusBadge, color: statusInfo.color, backgroundColor: statusInfo.background }}>{statusInfo.label}</div>
      </div>

      {status.error && (
        <div style={styles.errorBox}>
          <span>⚠️ {status.error}</span>
          <button style={styles.dismissBtn} onClick={onClearError}>닫기</button>
        </div>
      )}

      {restoredFromLocal && (
        <div style={styles.restoreBox}>
          <span>💾 지난 작업을 복원했습니다.</span>
          <button style={styles.dismissBtn} onClick={onDismissRestore}>숨기기</button>
        </div>
      )}

      <div style={styles.metaGrid}>
        <div>
          <span style={styles.metaLabel}>여행 유형</span>
          <strong>{travelTypeLabel(meta.travelType)}</strong>
        </div>
        <div>
          <span style={styles.metaLabel}>예산 모드</span>
          <strong>{budgetModeLabel(meta.budgetMode)}</strong>
        </div>
        <div>
          <span style={styles.metaLabel}>선호 이동수단</span>
          <strong>{transports.join(', ')}</strong>
        </div>
      </div>

      <div style={styles.budgetRow}>
        <div>
          <span style={styles.metaLabel}>총 예상 경비</span>
          <p style={styles.totalAmount}>{budget.total.toLocaleString()}원</p>
        </div>
        {budget.perDay.length > 0 && (
          <div style={styles.perDayList}>
            {budget.perDay.map((amount, idx) => (
              <span key={idx} style={styles.dayPill}>
                Day {trip.days[idx]?.day}: {amount.toLocaleString()}원
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  wrapper: {
    background: '#ffffff',
    border: '1px solid #e3e7eb',
    borderRadius: 12,
    padding: '16px 20px',
    marginBottom: 20,
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
  },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  tripTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: '#1b1f24',
  },
  metaLine: {
    margin: '4px 0',
    fontSize: 14,
    color: '#495057',
  },
  keywords: {
    margin: 0,
    fontSize: 13,
    color: '#6c757d',
  },
  statusBadge: {
    padding: '6px 12px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    alignSelf: 'flex-start',
  },
  errorBox: {
    backgroundColor: '#fff0f0',
    border: '1px solid #f5c2c7',
    borderRadius: 8,
    padding: '8px 12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 13,
    color: '#842029',
    marginTop: 12,
  },
  dismissBtn: {
    background: 'transparent',
    border: 'none',
    color: '#495057',
    cursor: 'pointer',
    fontSize: 13,
  },
  restoreBox: {
    backgroundColor: '#f1f5ff',
    border: '1px solid #cfe2ff',
    borderRadius: 8,
    padding: '8px 12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 13,
    color: '#0a58ca',
    marginTop: 12,
  },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 12,
    marginTop: 16,
  },
  metaLabel: {
    display: 'block',
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 2,
  },
  budgetRow: {
    marginTop: 18,
    borderTop: '1px solid #f1f3f5',
    paddingTop: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  totalAmount: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
    color: '#1e7e34',
  },
  perDayList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayPill: {
    background: '#f8f9fa',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    color: '#495057',
    border: '1px solid #e9ecef',
  },
};

export default TripSummaryBar;
