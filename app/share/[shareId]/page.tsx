// app/share/[shareId]/page.tsx
import { Metadata } from 'next';
import { TripData, Day, ItineraryItem } from '../../../types/trip';

async function getSharedTrip(shareId: string): Promise<TripData | null> {
  // 실제 배포 환경의 URL을 사용해야 합니다.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/share/${shareId}`, {
      cache: 'no-store', // 항상 최신 데이터를 가져오도록 설정
    });
    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    console.error("Failed to fetch shared trip:", error);
    return null;
  }
}

type Props = {
  params: Promise<{ shareId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shareId } = await params;
  const trip = await getSharedTrip(shareId);

  if (!trip) {
    return {
      title: '공유된 일정을 찾을 수 없습니다',
    };
  }

  return {
    title: `[여행 일정] ${trip.tripTitle}`,
    description: `${trip.destination} ${trip.period} 여행 코스를 확인해보세요. AI Trip Planner로 생성된 최적의 동선입니다.`,
    openGraph: {
      title: trip.tripTitle,
      description: `${trip.destination} ${trip.period} 여행 코스 공유`,
      type: 'article',
      // images: ['/og-image.png'], // 추후 동적 이미지 생성 기능 추가 가능
    },
    twitter: {
      card: 'summary',
      title: trip.tripTitle,
      description: `${trip.destination} ${trip.period} 여행 코스`,
    },
  };
}

// 스타일 객체 (app/page.tsx에서 필요한 부분만 가져와 단순화)
const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: '20px', fontFamily: "'Pretendard', sans-serif", maxWidth: '800px', margin: 'auto', background: '#fff', color: '#212529' },
  header: { textAlign: 'center', marginBottom: '30px', borderBottom: '2px solid #007bff', paddingBottom: '20px' },
  tripTitle: { fontSize: '32px', fontWeight: 'bold', margin: '0 0 10px 0' },
  tripInfo: { fontSize: '16px', color: '#6c757d' },
  resultBox: { border: '1px solid #e9ecef', padding: '25px', borderRadius: '12px', background: '#f8f9fa' },
  dayTitle: { paddingBottom: '10px', color: '#007bff', fontSize: '22px', borderBottom: '1px solid #dee2e6', marginBottom: '15px' },
  itineraryList: { listStyle: 'none', paddingLeft: '0' },
  itineraryItem: { marginBottom: '15px', background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  itemHeader: { margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '20px', display: 'flex', alignItems: 'center' },
  itemTime: { background: '#007bff', color: 'white', padding: '5px 12px', borderRadius: '15px', marginRight: '12px', fontSize: '16px' },
  itemDescription: { margin: '8px 0', color: '#495057', fontSize: '16px', whiteSpace: 'pre-wrap' },
  totalBudgetText: { textAlign: 'center', fontSize: '20px', fontWeight: 'bold', color: '#28a745', margin: '10px 0 20px 0' },
  dayTotalText: { fontSize: '16px', color: '#28a745', fontWeight: 'bold' },
  ctaBox: { marginTop: '40px', textAlign: 'center', padding: '30px', background: '#e7f1ff', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
  ctaTitle: { margin: '0 0 10px 0', color: '#0d6efd', fontSize: '24px', fontWeight: 'bold' },
  ctaText: { marginBottom: '20px', color: '#495057', fontSize: '16px' },
  ctaButton: { display: 'inline-block', padding: '14px 28px', background: '#0d6efd', color: 'white', textDecoration: 'none', borderRadius: '30px', fontWeight: 'bold', fontSize: '18px', boxShadow: '0 4px 6px rgba(13, 110, 253, 0.2)', transition: 'transform 0.2s' },
};


export default async function SharedTripPage({ params }: Props) {
  const { shareId } = await params;
  const tripData = await getSharedTrip(shareId);

  if (!tripData) {
    return (
      <div style={styles.container}>
        <h1 style={{ textAlign: 'center' }}>😢</h1>
        <p style={{ textAlign: 'center', fontSize: '20px' }}>
          공유된 여행 일정을 찾을 수 없거나, 더 이상 공유되지 않는 일정입니다.
        </p>
      </div>
    );
  }
  
  const grandTotal = tripData.days.reduce((total, day) => {
    const dayTotal = day.itinerary.reduce((sum, item) => sum + (item.expense || 0), 0);
    return total + dayTotal;
  }, 0);


  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.tripTitle}>✨ {tripData.tripTitle} ✨</h1>
        <p style={styles.tripInfo}>
          {tripData.destination} | {tripData.period} | #{tripData.keywords.split(',').join(' #')}
        </p>
      </div>

      <div style={styles.resultBox}>
        {grandTotal > 0 && (
          <p style={styles.totalBudgetText}>
            총 예상 경비: {grandTotal.toLocaleString()}원
          </p>
        )}

        {tripData.days.map((day: Day) => {
          const dailyTotal = day.itinerary.reduce((sum, item) => sum + (item.expense || 0), 0);
          return (
            <div key={day.day}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
                <h3 style={styles.dayTitle}>🗓️ Day {day.day}</h3>
                {dailyTotal > 0 && <span style={styles.dayTotalText}>일일 경비: {dailyTotal.toLocaleString()}원</span>}
              </div>
              <ul style={styles.itineraryList}>
                {day.itinerary.map((item: ItineraryItem) => (
                  <li key={item.place + item.time} style={styles.itineraryItem}>
                    <div style={styles.itemHeader}>
                      <span style={styles.itemTime}>{item.time}</span>
                      <span>{item.place}</span>
                    </div>
                    <p style={styles.itemDescription}>{item.description}</p>
                    {item.expense && <p style={{textAlign: 'right', color: '#007bff'}}>💰 {item.expense.toLocaleString()}원</p>}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      <div style={styles.ctaBox}>
        <h3 style={{ marginBottom: '10px' }}>나도 이런 여행을 계획하고 싶다면?</h3>
        <p style={{ marginBottom: '20px', color: '#666' }}>AI가 1분 만에 당신만의 맞춤 여행 일정을 만들어드립니다.</p>
        <a href="/" style={styles.ctaButton}>
          무료로 내 여행 일정 만들기 ✈️
        </a>
      </div>
    </div>
  );
}