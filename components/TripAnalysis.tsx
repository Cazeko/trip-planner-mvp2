import React from 'react';
import { TripData } from '../types/trip';
import { analyzeTrip, TripAnalysisMetrics } from '../lib/analysis';
import { TravelMode } from '../lib/scheduling';

interface TripAnalysisProps {
  trip: TripData;
  travelMode: TravelMode;
  onOptimize?: (type: 'optimize_efficiency' | 'reduce_fatigue') => void;
}

const TripAnalysis: React.FC<TripAnalysisProps> = ({ trip, travelMode, onOptimize }) => {
  const metrics: TripAnalysisMetrics = analyzeTrip(trip, travelMode);

  const getEfficiencyColor = (level: string) => {
    switch (level) {
      case 'Excellent': return '#198754'; // Green
      case 'Good': return '#0d6efd'; // Blue
      case 'Fair': return '#ffc107'; // Yellow
      case 'Poor': return '#dc3545'; // Red
      default: return '#6c757d';
    }
  };

  const getFatigueColor = (level: string) => {
    switch (level) {
      case 'Low': return '#198754'; // Green
      case 'Medium': return '#ffc107'; // Yellow
      case 'High': return '#dc3545'; // Red
      default: return '#6c757d';
    }
  };

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={styles.title}>📊 일정 분석 리포트</h3>
        {onOptimize && (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => onOptimize('optimize_efficiency')}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              ⚡ 효율성 높이기
            </button>
            <button
              onClick={() => onOptimize('reduce_fatigue')}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              😌 피로도 낮추기
            </button>
          </div>
        )}
      </div>
      
      <div style={styles.grid}>
        {/* Efficiency Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>이동 효율성</div>
          <div style={{ ...styles.scoreValue, color: getEfficiencyColor(metrics.efficiencyLevel) }}>
            {metrics.efficiencyScore}점
          </div>
          <div style={styles.badge}>{metrics.efficiencyLevel}</div>
          <p style={styles.desc}>
            {metrics.efficiencyLevel === 'Excellent' ? '동선이 완벽하게 최적화되었습니다.' :
             metrics.efficiencyLevel === 'Good' ? '이동 시간이 적절합니다.' :
             '이동 시간이 다소 깁니다.'}
          </p>
        </div>

        {/* Fatigue Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>피로도 예상</div>
          <div style={{ ...styles.scoreValue, color: getFatigueColor(metrics.fatigueLevel) }}>
            {metrics.fatigueLevel}
          </div>
          <p style={styles.desc}>
            {metrics.fatigueLevel === 'Low' ? '여유롭고 편안한 일정입니다.' :
             metrics.fatigueLevel === 'Medium' ? '적당한 활동량의 일정입니다.' :
             '다소 빡빡할 수 있는 일정입니다.'}
          </p>
        </div>

        {/* Stats Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>주요 지표</div>
          <div style={styles.statRow}>
            <span>총 이동 거리:</span>
            <strong>{metrics.totalDistanceKm} km</strong>
          </div>
          <div style={styles.statRow}>
            <span>총 이동 시간:</span>
            <strong>{Math.round(metrics.totalTravelTimeMinutes / 60)}시간 {metrics.totalTravelTimeMinutes % 60}분</strong>
          </div>
          <div style={styles.statRow}>
            <span>일 평균 장소:</span>
            <strong>{metrics.averageDailySpots}곳</strong>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '12px 16px',
    marginBottom: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    border: '1px solid #e2e8f0',
  },
  title: {
    fontSize: '15px',
    fontWeight: 'bold',
    marginBottom: '10px',
    color: '#2d3748',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
  },
  card: {
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    padding: '12px',
    textAlign: 'center' as const,
    border: '1px solid #edf2f7',
  },
  cardHeader: {
    fontSize: '13px',
    color: '#718096',
    marginBottom: '6px',
    fontWeight: 600,
  },
  scoreValue: {
    fontSize: '26px',
    fontWeight: 'bold',
    marginBottom: '3px',
  },
  badge: {
    display: 'inline-block',
    padding: '3px 7px',
    borderRadius: '12px',
    backgroundColor: '#edf2f7',
    fontSize: '11px',
    fontWeight: 600,
    color: '#4a5568',
    marginBottom: '6px',
  },
  desc: {
    fontSize: '12px',
    color: '#718096',
    lineHeight: 1.3,
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '6px',
    fontSize: '13px',
    color: '#4a5568',
  }
};

export default TripAnalysis;
