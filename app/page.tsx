// app/page.tsx
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { APIProvider } from '@vis.gl/react-google-maps';
import { jwtDecode } from 'jwt-decode';
import { authFetch, getStoredToken, clearStoredToken, ensureFreshToken } from '../lib/authClient';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import TripMap from '../components/TripMap';
import type { TripData, ItineraryItem, Day } from '../types/trip';
import PlaceAutocomplete from '../components/PlaceAutocomplete';
import AuthModal from '../components/AuthModal';
import ShareModal from '../components/ShareModal';
import AlternativesModal, { type AltFilters } from '../components/AlternativesModal';
import { scheduleWithDurations, type TravelMode } from '../lib/scheduling';
import { generateBalanceReport } from '../lib/categoryBalance';
import { getCityProfile, getCityDescription, getRecommendedMode } from '../lib/cityProfiles';
import TripSummaryBar from '../components/TripSummaryBar';

// Sanitize helper to clean odd AI strings and ensure readable Korean text
const sanitizeText = (t?: string) => {
  if (!t) return '';
  let s = t.trim();
  // Remove control characters
  s = s.replace(/[\u0000-\u001F\u007F]/g, '');
  // Remove long runs of extended Latin/diacritic noise
  s = s.replace(/[\u0100-\u036F]{3,}/g, '');
  // Normalize whitespace and collapse multiples
  s = s.replace(/\s{3,}/g, ' ');
  if (s.length > 260) s = s.slice(0, 260) + '…';
  return s;
};

// 거리 계산 함수 (Haversine formula)
const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371; // 지구 반지름 (km)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// 간단한 최근접 이웃 알고리즘으로 경로 정렬 (fallback)
const optimizeByNearestNeighbor = (items: ItineraryItem[]): ItineraryItem[] => {
  if (items.length <= 2) return items;
  
  // 좌표가 없는 항목은 정렬 제외
  const validItems = items.filter(it => 
    typeof it.latitude === 'number' && typeof it.longitude === 'number'
  );
  
  if (validItems.length <= 2) return items;
  
  const result: ItineraryItem[] = [validItems[0]]; // 첫 장소는 고정
  const remaining = validItems.slice(1);
  
  while (remaining.length > 0) {
    const current = result[result.length - 1];
    let minDist = Infinity;
    let minIdx = 0;
    
    // 가장 가까운 다음 장소 찾기
    remaining.forEach((item, idx) => {
      const dist = calculateDistance(
        current.latitude!, current.longitude!,
        item.latitude!, item.longitude!
      );
      if (dist < minDist) {
        minDist = dist;
        minIdx = idx;
      }
    });
    
    result.push(remaining[minIdx]);
    remaining.splice(minIdx, 1);
  }
  
  return result;
};

const summarizeBudget = (days: Day[]) => {
  const perDay = days.map(day =>
    day.itinerary.reduce((sum, item) => sum + (item.expense || 0), 0)
  );
  const total = perDay.reduce((sum, amount) => sum + amount, 0);
  return { perDay, total };
};

// --- TYPE DEFINITIONS ---

interface SavedTrip {
  id: string;
  tripTitle: string;
  destination: string;
  period: string;
  keywords: string;
  daysJson: any;
  createdAt: string;
}

interface User {
  id: string;
  email: string;
  nickname: string;
}

type ChatMsg = { role: 'user' | 'assistant'; content: string };
type Extracted = {
  destination?: string; period?: string; keywords?: string;
  travelType?: 'standard'|'family'|'couple'|'roadtrip'|'relaxed'|'intense';
  budgetMode?: 'economy'|'standard'|'premium'; include?: string; exclude?: string;
  preferredTransport?: 'DRIVE'|'TRANSIT'|'WALK';
  preferredTransportMulti?: Array<'DRIVE'|'TRANSIT'|'WALK'>;
};


// --- SORTABLE COMPONENT (from original page.tsx) ---

const SortableItem = ({ dayIndex, itemIndex, item, handleDeleteItem, handleUpdateItem, onOpenAlternatives, onOptimize, isOptimizing }: { dayIndex: number, itemIndex: number, item: ItineraryItem, handleDeleteItem: Function, handleUpdateItem: Function, onOpenAlternatives?: (dayIndex: number, itemIndex: number, item: ItineraryItem) => void, onOptimize?: (dayIndex: number) => void, isOptimizing?: boolean }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.place + item.time });
  const style = { transform: CSS.Transform.toString(transform), transition, ...styles.itineraryItem };
  
  const [isEditing, setIsEditing] = useState({ time: false, description: false, expense: false });
  const [editedContent, setEditedContent] = useState({ time: item.time, description: item.description, expense: item.expense || '' });
  const [reviewsOpen, setReviewsOpen] = useState(false);

  useEffect(() => {
    setEditedContent({ time: item.time, description: item.description, expense: item.expense || '' });
  }, [item]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, field: 'time' | 'description' | 'expense') => {
    setEditedContent({ ...editedContent, [field]: e.target.value });
  };
  
  const handleSave = (field: 'time' | 'description' | 'expense') => {
    const valueToSave = field === 'expense' ? parseFloat(editedContent.expense.toString()) || 0 : editedContent[field];
    handleUpdateItem(dayIndex, itemIndex, field, valueToSave);
    setIsEditing({ ...isEditing, [field]: false });
  };

  const handleKeyDown = (e: React.KeyboardEvent, field: 'time' | 'description' | 'expense') => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave(field);
    } else if (e.key === 'Escape') {
      const originalValue = field === 'expense' ? item.expense || '' : item[field];
      setEditedContent({ ...editedContent, [field]: originalValue });
      setIsEditing({ ...isEditing, [field]: false });
    }
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div style={styles.itemHeader}>
        <div {...listeners} style={{...styles.dragHandle, marginRight: '8px', cursor: 'grab'}}>⠿</div>
        {isEditing.time ? <input type="time" value={editedContent.time} onChange={(e) => handleInputChange(e, 'time')} onBlur={() => handleSave('time')} onKeyDown={(e) => handleKeyDown(e, 'time')} autoFocus style={{ ...styles.itemTime, ...styles.inlineInput }} onPointerDown={(e) => e.stopPropagation()} /> : <span style={styles.itemTime} onClick={() => setIsEditing({ ...isEditing, time: true })} onPointerDown={(e) => e.stopPropagation()}>{item.time}</span>}
        <span style={styles.placeName}>{item.place}</span>
      </div>
      {isEditing.description ? <textarea value={editedContent.description} onChange={(e) => handleInputChange(e, 'description')} onBlur={() => handleSave('description')} onKeyDown={(e) => handleKeyDown(e, 'description')} autoFocus style={{ ...styles.itemDescription, ...styles.inlineTextarea }} onPointerDown={(e) => e.stopPropagation()} /> : <p style={styles.itemDescription} onClick={() => setIsEditing({ ...isEditing, description: true })} onPointerDown={(e) => e.stopPropagation()}>{sanitizeText(item.description) || '클릭하여 설명을 추가하세요...'}</p>}
      {item.reason && <p style={styles.itemReason}>👍 추천 이유: {sanitizeText(item.reason)}</p>}
      <div style={styles.detailsContainer}>
        <div style={styles.detailItem}>
          <span style={styles.detailIcon}>💰</span> <strong>예상 경비:</strong>
          {isEditing.expense ? (
            <input type="number" value={editedContent.expense} onChange={(e) => handleInputChange(e, 'expense')} onBlur={() => handleSave('expense')} onKeyDown={(e) => handleKeyDown(e, 'expense')} autoFocus style={styles.expenseInput} onPointerDown={(e) => e.stopPropagation()} placeholder="0"/>
          ) : (
            <span onClick={() => setIsEditing({ ...isEditing, expense: true })} onPointerDown={(e) => e.stopPropagation()} style={styles.expenseText}>
              {item.expense ? `${item.expense.toLocaleString()}원` : '클릭하여 입력'}
            </span>
          )}
        </div>
        {item.formattedAddress && <p style={styles.detailItem}><span style={styles.detailIcon}>📍</span> <strong>주소:</strong> {item.formattedAddress}</p>}
        {item.internationalPhoneNumber && <p style={styles.detailItem}><span style={styles.detailIcon}>📞</span> <strong>전화번호:</strong> {item.internationalPhoneNumber}</p>}
        {item.rating && <p style={styles.detailItem}><span style={styles.detailIcon}>⭐</span> <strong>평점:</strong> {item.rating}</p>}
        {Array.isArray(item.reviews) && item.reviews.length > 0 && (
          <details open={reviewsOpen} onToggle={(e: any) => setReviewsOpen(e.target.open)} style={{ marginTop: '8px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', color: '#495057' }}>
              💬 리뷰 {item.reviews.length}개 {reviewsOpen ? '▲' : '▼'}
            </summary>
            {item.reviews.slice(0, 3).map((r, idx) => (
              <p key={idx} style={{ ...styles.detailItem, alignItems: 'flex-start', marginTop: '6px' }}>
                <span style={styles.detailIcon}>💬</span>
                <span>
                  <strong>{r.authorAttribution?.displayName || '리뷰'}</strong> ({r.rating || 'N/A'}★)
                  <br />{r.text?.text || ''}
                </span>
              </p>
            ))}
          </details>
        )}
      </div>
      <div style={styles.itemActions}>
        <button style={styles.actionButton} onClick={() => onOpenAlternatives && onOpenAlternatives(dayIndex, itemIndex, item)}>대안</button>
        <button style={styles.deleteButton} onClick={() => handleDeleteItem(dayIndex, itemIndex)}>&times;</button>
      </div>
    </div>
  );
};


// --- MAIN HOME COMPONENT ---

export default function Home() {
  // --- STATE MANAGEMENT ---
  
  // Chat state from LJJ
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { role: 'assistant', content: `안녕하세요! Tripdom과 함께 여행을 시작해요.\n\n아래 두 가지만 알려주세요. 바로 초안을 만들어 드릴게요.\n• 목적지 + 기간 (예: 부산 2박 3일)\n• 여행 스타일/관심사 (선택, 예: 맛집·여유로운·아이와 함께)\n\nTip) “대중교통 도보 섞어서”처럼 이동수단도 말해주면 더 정확해요.` }
  ]);
  const [input, setInput] = useState('');
  const [extracted, setExtracted] = useState<Extracted>({});
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [typing, setTyping] = useState(false);
  const [printing, setPrinting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const lastAskRef = useRef<string>('');
  const autoGenDoneRef = useRef<boolean>(false);

  // Core feature state from original page
  const [tripResult, setTripResult] = useState<TripData | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Combined loading state
  const [error, setError] = useState<string | null>(null);
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [currentTripId, setCurrentTripId] = useState<string | null>(null);
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  
  const [altModalOpen, setAltModalOpen] = useState(false);
  const [altBaseItem, setAltBaseItem] = useState<ItineraryItem | null>(null);
  const [altDayIndex, setAltDayIndex] = useState<number | null>(null);
  const [altItemIndex, setAltItemIndex] = useState<number | null>(null);
  const [altList, setAltList] = useState<any[]>([]);
  const [altTotal, setAltTotal] = useState(0);
  const [altPage, setAltPage] = useState(1);
  const [altFilters, setAltFilters] = useState<AltFilters>({ minRating: 4.0, openNow: false, categories: [] });
  
  const [optimizingDay, setOptimizingDay] = useState<number | null>(null);
  const [travelMode, setTravelMode] = useState('DRIVE');
  const [autoOptimizeAfterReplace, setAutoOptimizeAfterReplace] = useState(true);
  const [autoReassignAfterOptimize, setAutoReassignAfterOptimize] = useState(true);
  const [askedTransport, setAskedTransport] = useState(false);
  const [restoredFromLocal, setRestoredFromLocal] = useState(false);

  const [addingPlaceToDayIndex, setAddingPlaceToDayIndex] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const printRef = useRef<HTMLDivElement | null>(null);

  const budgetStats = useMemo(() => tripResult ? summarizeBudget(tripResult.days) : { perDay: [], total: 0 }, [tripResult]);
  const summaryMeta = useMemo(() => ({
    destination: extracted.destination || tripResult?.destination,
    period: extracted.period || tripResult?.period,
    travelType: extracted.travelType,
    budgetMode: extracted.budgetMode,
    keywords: extracted.keywords || tripResult?.keywords,
    preferredTransport: extracted.preferredTransport,
    preferredTransportMulti: extracted.preferredTransportMulti,
  }), [tripResult, extracted]);

  // --- EFFECTS ---

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, typing]);

  useEffect(() => {
    // 자동 생성 조건:
    // 1. ready === true (LJJ가 더 질문할 것 없음)
    // 2. 이동수단 단일 또는 다중 중 최소 하나 선택됨
    // 3. autoGenDoneRef 아직 false
    // 4. 일정 결과 아직 없음
    // 5. busy 아님
    const hasTransport = !!(extracted.preferredTransport || (extracted.preferredTransportMulti && extracted.preferredTransportMulti.length));
    if (ready && hasTransport && !autoGenDoneRef.current && !tripResult && !busy) {
      autoGenDoneRef.current = true;
      generateTrip();
    }
  }, [ready, tripResult, busy, extracted.preferredTransport, extracted.preferredTransportMulti]);

  useEffect(() => {
    const boot = async () => {
      await ensureFreshToken();
      const token = getStoredToken();
      if (token) {
        try {
          const decoded: { userId: string, email: string, nickname: string } = jwtDecode(token);
          setCurrentUser({ id: decoded.userId, email: decoded.email, nickname: decoded.nickname });
          fetchSavedTrips();
        } catch (error) {
          console.error("Invalid token:", error);
          clearStoredToken();
        }
      }
      // 로컬 스토리지에서 일정/추출 상태 복원
      try {
        const savedTrip = localStorage.getItem('tripdom-last-trip');
        const savedExtracted = localStorage.getItem('tripdom-last-extracted');
        if (savedTrip) {
          const parsed = JSON.parse(savedTrip);
          setTripResult(parsed);
          autoGenDoneRef.current = true; // 복원 시 자동 생성 방지
          setRestoredFromLocal(true);
        }
        if (savedExtracted) {
          const parsed = JSON.parse(savedExtracted);
          setExtracted(parsed);
        }
      } catch (e) {
        console.error('Failed to restore state:', e);
      }
    };
    boot();
  }, []);

  // 이동수단을 먼저 물어보기: 목적지/기간이 있고 선호 이동수단이 없을 때 1회 질문
  useEffect(() => {
    if (!askedTransport && extracted.destination && extracted.period && !extracted.preferredTransport && !(extracted.preferredTransportMulti && extracted.preferredTransportMulti.length)) {
      setMsgs(prev => [...prev, { role: 'assistant', content: '이동 수단을 선택해 주세요. 차량, 대중교통, 도보 또는 복수 조합(예: 차량 대중교통 도보 섞어서)도 가능합니다.' }]);
      setAskedTransport(true);
    }
  }, [extracted.destination, extracted.period, extracted.preferredTransport, extracted.preferredTransportMulti, askedTransport]);

  // LJJ 추출 결과로 이동수단 상태 동기화
  useEffect(() => {
    // 다중 이동수단이 들어온 경우 첫 번째 모드를 기본으로 사용
    if (extracted.preferredTransportMulti && extracted.preferredTransportMulti.length) {
      setTravelMode(extracted.preferredTransportMulti[0]);
    } else if (extracted.preferredTransport) {
      setTravelMode(extracted.preferredTransport);
    }
  }, [extracted.preferredTransport, extracted.preferredTransportMulti]);

  // 상태 변경 시 로컬 스토리지 저장
  useEffect(() => {
    if (tripResult) {
      try {
        localStorage.setItem('tripdom-last-trip', JSON.stringify(tripResult));
      } catch (e) {
        console.error('Failed to save trip:', e);
      }
    }
  }, [tripResult]);

  useEffect(() => {
    if (Object.keys(extracted).length > 0) {
      try {
        localStorage.setItem('tripdom-last-extracted', JSON.stringify(extracted));
      } catch (e) {
        console.error('Failed to save extracted:', e);
      }
    }
  }, [extracted]);

  // --- CHAT & GENERATION LOGIC (from LJJ) ---

  const askLJJ = async (text: string) => {
    setBusy(true);
    setTyping(true);
    setError(null);
    try {
      const withUser = [...msgs, { role: 'user' as const, content: text }];
      setMsgs(withUser);
      
      const res = await fetch('/api/ljj', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ messages: withUser, extracted, trip: tripResult }) 
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'chat error');

      // 최소 2초 대기 (AI가 고민하는 느낌)
      const minThinkingTime = 2000;
      const startTime = Date.now();
      
      if (data.trip) {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, minThinkingTime - elapsed);
        await new Promise(resolve => setTimeout(resolve, remaining));
        
        setTripResult(data.trip);
        setMsgs(prev => [...prev, { role: 'assistant', content: data.reply || "일정을 수정했어요." }]);
      } else {
        const reply = data.reply || '';
        let ask: string = data.ask || '';
        const nextExtracted = data.extracted || {};
        
        const hasTravelType = !!(nextExtracted.travelType || extracted.travelType);
        const hasBudget = !!(nextExtracted.budgetMode || extracted.budgetMode);
        if (ask && /여행\s*유형|유형을\s*알려주세요/i.test(ask) && hasTravelType) ask = '';
        if (ask && /예산|예산\s*수준/i.test(ask) && hasBudget) ask = '';
        
        const bullet = ask && ask !== lastAskRef.current ? `\n\n• ${ask}` : '';
        
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, minThinkingTime - elapsed);
        await new Promise(resolve => setTimeout(resolve, remaining));
        
        setMsgs(prev => [...prev, { role: 'assistant', content: reply + bullet }]);
        
        if (ask) lastAskRef.current = ask; else lastAskRef.current = '';
        
        setExtracted(nextExtracted);
        
        // ready 상태: LJJ에서 ready이고 질문이 없으며, 이동수단도 선택되어야 함
        const isReadyFromLJJ = !!data.ready && !ask;
        const hasTransport = !!(nextExtracted.preferredTransport || extracted.preferredTransport || (nextExtracted.preferredTransportMulti && nextExtracted.preferredTransportMulti.length) || (extracted.preferredTransportMulti && extracted.preferredTransportMulti.length));
        setReady(isReadyFromLJJ && hasTransport);
      }
    } catch (e: any) {
      setError(e.message);
      setMsgs(prev => [...prev, { role: 'assistant', content: `오류가 발생했어요: ${e.message}` }]);
    } finally {
      setBusy(false);
      setTyping(false);
      // 응답 완료 후 입력창에 자동 포커스
      setTimeout(() => chatInputRef.current?.focus(), 100);
    }
  };

  const generateTrip = async () => {
    if (!ready && !Object.keys(extracted).length) return;
    setIsLoading(true);
    setBusy(true);
    setTripResult(null);
    setRestoredFromLocal(false);
    setError(null);
    setCurrentTripId(null);
    setMsgs(prev => [...prev, { role: 'assistant', content: '알겠습니다! 최고의 일정을 생성하고 있어요. 잠시만 기다려주세요...' }]);

    // 공항/터미널 키워드 탐지
    const isAirport = (name?: string) => /공항|airport|터미널|terminal/i.test(name || '');

    try {
      const body = { 
        destination: extracted.destination, 
        period: extracted.period, 
        keywords: extracted.keywords || '', 
        travelType: extracted.travelType, 
        budgetMode: extracted.budgetMode, 
        include: extracted.include, 
        exclude: extracted.exclude, 
        preferredTransport: extracted.preferredTransport,
      };
      const response = await fetch('/api/generate-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '알 수 없는 에러가 발생했습니다.');
      
      const destination = extracted.destination || '';
      let days = Array.isArray(data.days) ? data.days as Day[] : [];

      // 1) 공항 아이템 보정: 마지막 날 마지막으로 이동, 그 외 날에서는 제거
      if (days.length) {
        const lastIdx = days.length - 1;
        days = days.map((d, idx) => {
          if (!Array.isArray(d.itinerary)) return d;
          const rest = d.itinerary.filter(it => !isAirport(it.place));
          if (idx === lastIdx) {
            const airports = d.itinerary.filter(it => isAirport(it.place));
            const tail = airports.length ? [{ ...airports[0], time: '20:30' }] : [];
            return { ...d, itinerary: [...rest, ...tail] };
          }
          return { ...d, itinerary: rest };
        });
      }

      // 2) 이동수단 기반 재배치
      let scheduledDays = days.map((day: Day) => ({
        ...day,
        itinerary: scheduleWithDurations(day.itinerary, travelMode as TravelMode, destination)
      }));

      // 3) 강화된 경로 최적화
      if (travelMode !== 'TRANSIT') {
        const optimized = await Promise.all(scheduledDays.map(async (d, dayIdx) => {
          if (!d.itinerary || d.itinerary.length < 3) return d; // 최소 3개 이상일 때만
          
          console.log(`[최적화] Day ${dayIdx + 1} 시작 (${d.itinerary.length}개 장소)`);
          
          try {
            // Google Routes API 시도
            const resp = await fetch('/api/optimize-route', {
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ itinerary: d.itinerary, travelMode })
            });
            
            if (resp.ok) {
              const arr = await resp.json();
              if (Array.isArray(arr) && arr.length === d.itinerary.length) {
                console.log(`[최적화] Day ${dayIdx + 1} Google API 성공`);
                return { ...d, itinerary: scheduleWithDurations(arr, travelMode as TravelMode, destination) };
              }
            }
            
            // API 실패 시 fallback: 최근접 이웃 알고리즘
            console.log(`[최적화] Day ${dayIdx + 1} Google API 실패, fallback 사용`);
            const optimizedByDistance = optimizeByNearestNeighbor(d.itinerary);
            return { ...d, itinerary: scheduleWithDurations(optimizedByDistance, travelMode as TravelMode, destination) };
            
          } catch (err) {
            console.error(`[최적화] Day ${dayIdx + 1} 오류:`, err);
            // 오류 시에도 fallback 적용
            const optimizedByDistance = optimizeByNearestNeighbor(d.itinerary);
            return { ...d, itinerary: scheduleWithDurations(optimizedByDistance, travelMode as TravelMode, destination) };
          }
        }));
        scheduledDays = optimized;
      } else {
        // 대중교통 모드도 거리 기반 정렬 적용
        console.log('[최적화] 대중교통 모드: 거리 기반 정렬 적용');
        scheduledDays = scheduledDays.map((d, dayIdx) => {
          if (!d.itinerary || d.itinerary.length < 3) return d;
          const optimizedByDistance = optimizeByNearestNeighbor(d.itinerary);
          return { ...d, itinerary: scheduleWithDurations(optimizedByDistance, travelMode as TravelMode, destination) };
        });
      }

      setTripResult({ ...data, destination, period: extracted.period, keywords: extracted.keywords, days: scheduledDays });
      // 생성 중 메시지만 제거하고 기존 대화는 유지합니다.
      setMsgs(prev => prev.filter(m => !m.content.includes('생성하고 있어요')).concat({ role: 'assistant', content: '일정이 생성되었습니다! 오른쪽에서 확인하고 수정할 수 있어요.' }));

    } catch (err: any) { 
      setError(err.message); 
      setMsgs(prev => [...prev, { role: 'assistant', content: `생성 중 오류가 발생했습니다: ${err.message}` }]);
    } finally { 
      setIsLoading(false); 
      setBusy(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || busy) return;
    const text = input.trim();
    setInput('');
    // 우선 FastAPI 수정 엔진 시도 -> 실패 시 기존 LJJ로 폴백
    if (tripResult) {
      try {
        setBusy(true);
        setTyping(true);
        const withUser = [...msgs, { role: 'user' as const, content: text }];
        setMsgs(withUser);
        
        const startTime = Date.now();
        const resp = await fetch('/api/ai/modify-trip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: withUser, extracted, trip: tripResult })
        });
        const data = await resp.json();
        
        if (resp.ok && data?.trip) {
          // 최소 2초 대기
          const elapsed = Date.now() - startTime;
          const remaining = Math.max(0, 2000 - elapsed);
          await new Promise(resolve => setTimeout(resolve, remaining));
          
          // 프론트 스케줄러로 10분 단위 재배치 적용
          const destination = data.trip.destination || tripResult.destination;
          const reDays = data.trip.days.map((d: Day) => ({
            ...d,
            itinerary: scheduleWithDurations(d.itinerary, travelMode as TravelMode, destination)
          }));
          setTripResult({ ...data.trip, days: reDays });
          setMsgs(prev => [...prev, { role: 'assistant', content: data.reply || '일정을 수정했어요.' }]);
          setBusy(false); setTyping(false);
          // 응답 완료 후 입력창에 자동 포커스
          setTimeout(() => chatInputRef.current?.focus(), 100);
          return;
        }
      } catch (err) {
        // FastAPI 불가 시 LJJ로 폴백
      } finally {
        setBusy(false); setTyping(false);
        // 폴백 경로에서도 포커스 유지
        setTimeout(() => chatInputRef.current?.focus(), 100);
      }
    }
    // 기본 경로: 기존 LJJ 처리
    await askLJJ(text);
  };

  // --- CORE FEATURE HANDLERS (from original page.tsx) ---

  const handleLogout = () => {
    clearStoredToken();
    setCurrentUser(null);
    setSavedTrips([]);
    setTripResult(null);
    setCurrentTripId(null);
    setMsgs(prev => [...prev, { role: 'assistant', content: '로그아웃되었습니다.' }]);
  };

  const handleSaveTrip = async () => {
    if (!tripResult || !currentUser) { alert('저장할 여행 일정이 없거나 로그인 상태가 아닙니다.'); return; }
    const token = getStoredToken(); if (!token) { alert('로그인이 필요합니다.'); return; }
    const customTitle = prompt('저장할 여행 일정의 제목을 입력하세요:', tripResult.tripTitle);
    if (!customTitle) return;
    try {
      const response = await authFetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripTitle: customTitle,
          destination: tripResult.destination,
          period: tripResult.period,
          keywords: tripResult.keywords,
          daysJson: tripResult.days,
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '저장에 실패했습니다.');
      alert('여행 일정이 성공적으로 저장되었습니다!');
      setCurrentTripId(data.trip.id);
      fetchSavedTrips();
    } catch (err: any) { alert(`저장 실패: ${err.message}`); }
  };

  async function fetchSavedTrips() {
    const remember = typeof window !== 'undefined' && localStorage.getItem('trip-planner-remember') === '1';
    const token = getStoredToken();
    if (!remember || !token) return;
    try {
      const response = await authFetch('/api/trips', { method: 'GET' });
      if (!response.ok) {
        console.warn('Failed to fetch trips', response.status);
        return;
      }
      const data = await response.json().catch(() => []);
      if (Array.isArray(data)) setSavedTrips(data);
    } catch (err) {
      console.error('fetchSavedTrips error', err);
    }
  }

  const handleLoadTrip = (trip: SavedTrip) => {
    setTripResult({
      tripTitle: trip.tripTitle,
      destination: trip.destination,
      period: trip.period,
      keywords: trip.keywords,
      days: trip.daysJson,
    });
    setExtracted({
      destination: trip.destination,
      period: trip.period,
      keywords: trip.keywords,
    });
    setCurrentTripId(trip.id);
    setRestoredFromLocal(false);
    setMsgs(prev => [...prev, { role: 'assistant', content: `'${trip.tripTitle}' 일정을 불러왔습니다.` }]);
  };
  

  const handleDeleteTrip = async (tripId: string) => {
    if (!confirm("정말로 이 일정을 삭제하시겠습니까?")) return;
    const token = getStoredToken(); if (!token) { alert('로그인이 필요합니다.'); return; }
    try {
      const response = await authFetch(`/api/trips/${tripId}`, { method: 'DELETE' });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '삭제에 실패했습니다.');
      alert('일정이 삭제되었습니다.');
      setSavedTrips(prev => prev.filter(trip => trip.id !== tripId));
      if (currentTripId === tripId) {
        setTripResult(null);
        setCurrentTripId(null);
      }
    } catch (err: any) { alert(`삭제 실패: ${err.message}`); }
  };

  const handleDeleteItem = (dayIndex: number, itemIndex: number) => {
    if (!tripResult) return;
    const newTripResult = { ...tripResult, days: tripResult.days.map((day, i) => i === dayIndex ? { ...day, itinerary: day.itinerary.filter((_, j) => j !== itemIndex) } : day) };
    setTripResult(newTripResult);
  };

  const handleUpdateItem = (dayIndex: number, itemIndex: number, field: 'time' | 'description' | 'expense', value: string | number) => {
    if (!tripResult) return;
    const newTripResult = { ...tripResult };
    newTripResult.days[dayIndex].itinerary[itemIndex] = { ...newTripResult.days[dayIndex].itinerary[itemIndex], [field]: value };
    setTripResult(newTripResult);
  };
  
  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!tripResult || !over || active.id === over.id) return;
    const dayIndex = tripResult.days.findIndex(day => day.itinerary.some(item => (item.place + item.time) === active.id));
    if (dayIndex === -1) return;
    const oldIndex = tripResult.days[dayIndex].itinerary.findIndex(item => (item.place + item.time) === active.id);
    const newIndex = tripResult.days[dayIndex].itinerary.findIndex(item => (item.place + item.time) === over.id);
    const newItinerary = arrayMove(tripResult.days[dayIndex].itinerary, oldIndex, newIndex);

    const reassigned = scheduleWithDurations(newItinerary, travelMode as TravelMode, tripResult.destination);

    const newDays = [...tripResult.days];
    newDays[dayIndex] = { ...newDays[dayIndex], itinerary: reassigned };
    setTripResult({ ...tripResult, days: newDays });
  };
  
  const handlePlaceAdd = async (placeId: string) => {
    if (addingPlaceToDayIndex === null || !tripResult) return;
    try {
      const response = await fetch('/api/get-place-details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placeId }) });
      const placeDetails = await response.json();
      if (!response.ok) throw new Error(placeDetails.error || '장소 정보를 가져오지 못했습니다.');
      const newDays = [...tripResult.days];
      const targetDay = newDays[addingPlaceToDayIndex];
      
      const newItinerary = [...targetDay.itinerary, { time: "00:00", place: placeDetails.place || '이름 없는 장소', description: '', reason: '', ...placeDetails }];
      const reassigned = scheduleWithDurations(newItinerary, travelMode as TravelMode, tripResult.destination);
      
      targetDay.itinerary = reassigned;
      setTripResult({ ...tripResult, days: newDays });
      setAddingPlaceToDayIndex(null);
    } catch (err: any) { setError(`장소 추가 실패: ${err.message}`); }
  };

  const handleOptimizeRoute = async (dayIndex: number, baseItinerary?: ItineraryItem[]) => {
    if (!tripResult) return;
    setOptimizingDay(dayIndex);
    
    try {
      const itineraryToOptimize = baseItinerary || tripResult.days[dayIndex].itinerary;
      
      if (itineraryToOptimize.length < 3) {
        alert('최적화하려면 최소 3개 이상의 장소가 필요합니다.');
        setOptimizingDay(null);
        return;
      }
      
      let finalItinerary: ItineraryItem[];
      
      if (travelMode === 'TRANSIT') {
        // 대중교통은 거리 기반 정렬만 적용
        console.log('[수동 최적화] 대중교통 모드: 거리 기반 정렬');
        finalItinerary = optimizeByNearestNeighbor(itineraryToOptimize);
      } else {
        // Google API 시도
        try {
          const response = await fetch('/api/optimize-route', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ itinerary: itineraryToOptimize, travelMode }) 
          });
          
          if (response.ok) {
            const optimizedItinerary = await response.json();
            if (Array.isArray(optimizedItinerary) && optimizedItinerary.length === itineraryToOptimize.length) {
              console.log('[수동 최적화] Google API 성공');
              finalItinerary = optimizedItinerary;
            } else {
              throw new Error('API 응답 형식 오류');
            }
          } else {
            throw new Error('API 요청 실패');
          }
        } catch (apiError) {
          // Fallback: 거리 기반 정렬
          console.log('[수동 최적화] Google API 실패, fallback 사용');
          finalItinerary = optimizeByNearestNeighbor(itineraryToOptimize);
        }
      }
      
      // 시간 재계산
      if (autoReassignAfterOptimize) {
        finalItinerary = scheduleWithDurations(finalItinerary, travelMode as TravelMode, tripResult.destination);
      }

      const newDays = [...tripResult.days];
      newDays[dayIndex] = { ...newDays[dayIndex], itinerary: finalItinerary };
      setTripResult({ ...tripResult, days: newDays });
      alert('경로가 성공적으로 최적화되었습니다!');
    } catch (err: any) { 
      setError(err.message); 
      alert(`최적화 실패: ${err.message}`);
    } finally { 
      setOptimizingDay(null); 
    }
  };

  // 이동수단 변경 시 전체 일정 재배치
  useEffect(() => {
    if (!tripResult) return;
    const destination = tripResult.destination;
    const re = tripResult.days.map(d => ({
      ...d,
      itinerary: scheduleWithDurations(d.itinerary, travelMode as TravelMode, destination)
    }));
    setTripResult(prev => prev ? { ...prev, days: re } : prev);
  }, [travelMode]);

  const fetchAlternatives = async (lat: number, lng: number, page: number, filters: AltFilters) => {
    try {
      const resp = await fetch('/api/nearby-suggestions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, count: 6, page, pageSize: 6, minRating: filters.minRating, openNow: filters.openNow, categories: filters.categories })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || '대안 검색 실패');
      setAltList(data.candidates || []);
      setAltTotal(Number(data.total) || (data.candidates?.length || 0));
      setAltPage(page);
    } catch (e: any) {
      setError(e.message || '근처 대안 조회 실패');
    }
  };

  const openAlternatives = async (dayIndex: number, itemIndex: number, item: ItineraryItem) => {
    if (!item || typeof item.latitude !== 'number' || typeof item.longitude !== 'number') { alert('이 아이템에는 좌표 정보가 없습니다.'); return; }
    setAltBaseItem(item);
    setAltDayIndex(dayIndex);
    setAltItemIndex(itemIndex);
    setAltModalOpen(true);
    await fetchAlternatives(item.latitude, item.longitude, 1, altFilters);
  };

  const applyAlternative = async (candidate: any) => {
    if (!tripResult || altDayIndex === null || altItemIndex === null) return;
    try {
      const newDays = [...tripResult.days];
      const oldItem = newDays[altDayIndex].itinerary[altItemIndex];
      const patched = {
        ...oldItem,
        place: candidate.place || oldItem.place,
        formattedAddress: candidate.formattedAddress ?? oldItem.formattedAddress,
        latitude: candidate.latitude ?? oldItem.latitude,
        longitude: candidate.longitude ?? oldItem.longitude,
        rating: candidate.rating ?? oldItem.rating,
        internationalPhoneNumber: candidate.internationalPhoneNumber ?? oldItem.internationalPhoneNumber,
        websiteUri: candidate.websiteUri ?? oldItem.websiteUri,
        regularOpeningHours: candidate.regularOpeningHours ?? oldItem.regularOpeningHours,
        types: candidate.types ?? oldItem.types,
        photoReference: candidate.photoReference ?? oldItem.photoReference,
      } as ItineraryItem;
      const updatedItinerary = [...newDays[altDayIndex].itinerary];
      updatedItinerary[altItemIndex] = patched;
      
      if (autoOptimizeAfterReplace) {
        await handleOptimizeRoute(altDayIndex, updatedItinerary);
      } else {
        newDays[altDayIndex] = { ...newDays[altDayIndex], itinerary: updatedItinerary };
        setTripResult(prev => ({ ...(prev as TripData), days: newDays }));
      }
      setAltModalOpen(false);

    } catch (e: any) {
      setError(e.message || '대안 적용 실패');
    }
  };

  const handleAutoBalanceCategories = async () => {
    if (!tripResult) { alert('균형 조정할 일정이 없습니다.'); return; }
    
    try {
      setIsLoading(true);
      const response = await fetch('/api/auto-balance-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          days: tripResult.days,
          destination: tripResult.destination 
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '카테고리 균형 조정 실패');
      
      // 시간 재배치
      const reScheduledDays = data.days.map((day: Day) => ({
        ...day,
        itinerary: scheduleWithDurations(day.itinerary, travelMode as TravelMode, tripResult.destination)
      }));
      
      setTripResult({ ...tripResult, days: reScheduledDays });
      // suggestions를 성공/실패로 분리하여, 사용자가 보기 편한 요약만 채팅으로 표시합니다.
      const suggestions: string[] = Array.isArray(data.suggestions) ? data.suggestions : [];
      const added: string[] = [];
      const notFound: string[] = [];
      suggestions.forEach(s => {
        if (/찾을 수 없음|찾지 못했습니다|없음/.test(s)) notFound.push(s);
        else added.push(s);
      });

      let shortMsg = '';
      if (added.length > 0) shortMsg += `카테고리 균형 조정: ${added.length}건 추가됨.`;
      if (notFound.length > 0) shortMsg += (shortMsg ? ' ' : '') + `${notFound.length}건은 후보를 찾지 못했습니다.`;
      if (!shortMsg) shortMsg = '카테고리가 이미 균형있게 구성되어 있습니다.';

      // 채팅에는 간단한 요약만 추가하고, 상세는 콘솔에 남깁니다.
      setMsgs(prev => [...prev, { role: 'assistant', content: shortMsg }]);
      if (added.length > 0) console.info('[Auto Balance] added:', added);
      if (notFound.length > 0) console.warn('[Auto Balance] not found:', notFound);
    } catch (err: any) {
      setError(err.message);
      alert(`카테고리 균형 조정 실패: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleShare = async () => {
    if (!currentTripId) { alert('공유하려면 먼저 일정을 저장해야 합니다.'); return; }
    const token = getStoredToken(); if (!token) return;
    try {
      const response = await authFetch(`/api/trips/${currentTripId}/share`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '공유 링크 생성 실패');
      setShareUrl(`${window.location.origin}/share/${data.shareId}`);
      setShowShareModal(true);
    } catch (err: any) { alert(`오류: ${err.message}`); }
  };

  // PDF 한글 폰트 로더: 로컬(public/fonts) → 대체(CDN) 순으로 시도
  const loadKoreanPdfFont = async (pdf: any): Promise<string | null> => {
    const sources = [
      // 권장 로컬 파일들 (있는 순서대로 시도)
      '/fonts/NotoSansKR-Regular.ttf',
      '/fonts/NotoSansKR-VariableFont_wght.ttf',
      '/fonts/NotoSansKR-Bold.ttf',
      '/fonts/Pretendard-Regular.ttf',
      // 공개 CDN 폴백 (CORS 허용 필요)
      'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@v2.004/Sans/TTF/NotoSansKR-Regular.ttf'
    ];

    // ArrayBuffer → Base64 (대용량 안전 변환)
    const toBase64 = (buf: ArrayBuffer) => {
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      let binary = '';
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as any);
      }
      return btoa(binary);
    };

    for (const src of sources) {
      try {
        const res = await fetch(src, { mode: 'cors' });
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        const b64 = toBase64(buf);
  const vfsName = 'KFont-Regular.ttf';
  const fontName = 'KFont';
  pdf.addFileToVFS(vfsName, b64);
  // 동일 TTF를 normal/bold/italic/bolditalic에 모두 매핑하여 스타일 전환 시 기본 폰트로 폴백되는 문제 방지
  pdf.addFont(vfsName, fontName, 'normal');
  pdf.addFont(vfsName, fontName, 'bold');
  pdf.addFont(vfsName, fontName, 'italic');
  pdf.addFont(vfsName, fontName, 'bolditalic');
  return fontName;
      } catch {
        // try next source
      }
    }
    return null;
  };

  const handleExportPDF = async () => {
    if (!tripResult) { alert('내보낼 일정이 없습니다.'); return; }
    try {
      const pdf = new jsPDF('p', 'mm', 'a4') as any;
      // 한글 폰트 임베드 (로컬/폴백 순서)
      const kFont = await loadKoreanPdfFont(pdf);

      // 폰트 로드 실패 시: 사용자에게 명확 안내 + 이미지 기반 폴백
      if (!kFont) {
        console.warn('[PDF] Korean font NOT embedded. Add public/fonts/NotoSansKR-Regular.ttf for crisp selectable text. Falling back to image.');
        alert('한글 폰트 파일이 없어 이미지 방식으로 PDF를 생성합니다. 선택/검색이 안 될 수 있으니 fonts 폴더에 NotoSansKR-Regular.ttf를 추가하세요.');
        const el = printRef.current;
        if (!el) { alert('화면 요소를 찾지 못했습니다.'); return; }
        setPrinting(true);
        try {
          const canvas = await html2canvas(el as HTMLElement, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
          const imgData = canvas.toDataURL('image/png');
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const imgWidth = pageWidth;
          const imgHeight = canvas.height * imgWidth / canvas.width;
          let heightLeft = imgHeight;
          let position = 0;
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
          while (heightLeft > 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
          }
          setPrinting(false);
          pdf.save(`${tripResult.tripTitle || 'trip'}.pdf`);
          return;
        } catch (imgErr: any) {
          setPrinting(false);
          console.error('Image-based PDF fallback failed', imgErr);
          alert('PDF 폰트를 불러오지 못했고 이미지 폴백도 실패했습니다. 네트워크/보안 정책을 확인해주세요.');
          return;
        }
      }

      const baseFont = kFont;
      pdf.setFont(baseFont, 'normal');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 14;
      
  // 헤더 그리기 (타이틀 + 메타 + 라인)
  pdf.setFont(baseFont, 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(34, 62, 120);
  pdf.text(sanitizeText(tripResult.tripTitle), margin, 18);
      
  pdf.setFont(baseFont, 'normal');
  pdf.setFontSize(10.5);
  pdf.setTextColor(90, 98, 104);
  const meta = `${sanitizeText(tripResult.destination)} · ${sanitizeText(tripResult.period)} · ${sanitizeText(tripResult.keywords || '')}`;
  pdf.text(meta, margin, 25);
  pdf.setDrawColor(221, 232, 243);
  pdf.setLineWidth(0.6);
  pdf.line(margin, 28, pageWidth - margin, 28);
  pdf.setTextColor(0, 0, 0);
      
      const total = tripResult.days.reduce((t, d) => 
        t + d.itinerary.reduce((s, i) => s + (i.expense || 0), 0), 0
      );
  pdf.setFont(baseFont, 'bold');
  pdf.setTextColor(31, 122, 46);
  pdf.text(`총 예상 경비: ${total.toLocaleString()}원`, margin, 34);
  pdf.setTextColor(0, 0, 0);
      
      // 카테고리 균형 보고서
      const balanceReport = generateBalanceReport(tripResult.days);
      if (balanceReport.length > 0) {
        pdf.setFont(baseFont, 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(200, 100, 0);
        let reportY = 40;
        balanceReport.forEach(line => {
          pdf.text(`⚠ ${sanitizeText(line)}`, margin, reportY);
          reportY += 5;
        });
        pdf.setTextColor(0, 0, 0);
      }
      
      let startY = balanceReport.length > 0 ? 40 + balanceReport.length * 5 + 5 : 40;
      
      // 각 Day마다 새 페이지 + AutoTable
      tripResult.days.forEach((day, idx) => {
        if (idx > 0) pdf.addPage();
        pdf.setFont(baseFont, 'bold');
        pdf.setFontSize(14);
        pdf.setTextColor(34, 62, 120);
        pdf.text(`Day ${day.day}`, margin, idx === 0 ? startY : 20);
        pdf.setTextColor(0, 0, 0);
        
        const tableData = day.itinerary.map(it => {
          const bullets: string[] = [];
          if (it.description) bullets.push(`• ${sanitizeText(it.description)}`);
          if (it.reason) bullets.push(`• 추천: ${sanitizeText(it.reason)}`);
          const extras: string[] = [];
          if (it.formattedAddress) extras.push(sanitizeText(it.formattedAddress));
          if (it.internationalPhoneNumber) extras.push(it.internationalPhoneNumber);
          if (typeof it.rating === 'number') extras.push(`평점 ${it.rating}`);
          if (extras.length) bullets.push(`• ${extras.join(' · ')}`);
          const memo = bullets.join('\n');

          return [
            it.time || '',
            sanitizeText(it.place) || '',
            memo,
            typeof it.expense === 'number' ? `${it.expense.toLocaleString()}원` : ''
          ];
        });
        
        autoTable(pdf, {
          startY: idx === 0 ? startY + 6 : 26,
          head: [['시간', '장소', '메모', '경비']],
          body: tableData,
          theme: 'grid',
          headStyles: { 
            fillColor: [34, 62, 120],
            textColor: [255, 255, 255],
            fontSize: 11,
            fontStyle: 'bold',
            halign: 'center'
          },
          styles: { 
            fontSize: 10.5,
            cellPadding: 3.5,
            lineColor: [221, 232, 243],
            lineWidth: 0.2,
            font: baseFont,
            valign: 'top'
          },
          alternateRowStyles: {
            fillColor: [248, 251, 255]
          },
          columnStyles: {
            0: { cellWidth: 18, halign: 'center' },
            1: { cellWidth: 55 },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 28, halign: 'right' }
          },
          margin: { left: margin, right: margin }
        });
      });
      
  pdf.save(`${tripResult.tripTitle || 'trip'}.pdf`);
  console.info('[PDF] Export complete with embedded Korean font.');
    } catch (e: any) {
      alert(`PDF 생성 실패: ${e.message || e}`);
    }
  };  // --- RENDER LOGIC ---

  const getCenterLocation = () => {
    if (tripResult && tripResult.days.length > 0 && tripResult.days[0].itinerary.length > 0) {
      const firstItem = tripResult.days[0].itinerary[0];
      if (firstItem.latitude && firstItem.longitude) {
        return { lat: firstItem.latitude, lng: firstItem.longitude };
      }
    }
    return { lat: 37.5665, lng: 126.9780 }; // Default to Seoul
  };

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return <div>Google Maps API 키를 로드할 수 없습니다. .env.local 파일을 확인해주세요.</div>;
  }

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}>
      <div style={styles.pageContainer}>
        {/* Left Column: Chat */}
        <div style={styles.chatColumn}>
          <div style={styles.chatHeader}>
            <h1 style={styles.chatTitle}>Tripdom</h1>
            <div style={styles.authContainer}>
              {currentUser ? (
                <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                  <span style={{fontSize: 14, fontWeight: 500, color: '#000000'}}>안녕하세요! {currentUser.nickname}님</span>
                  <button onClick={handleLogout} style={styles.authButton}>로그아웃</button>
                </div>
              ) : (
                <button onClick={() => setShowAuthModal(true)} style={styles.authButton}>로그인</button>
              )}
            </div>
          </div>

          <div style={styles.chatMessagesContainer}>
            {msgs.map((m, i) => (
              <div key={i} style={{...styles.messageBubble, ...(m.role === 'user' ? styles.userBubble : styles.assistantBubble)}}>
                {m.content}
              </div>
            ))}
            {typing && (
              <div style={{...styles.messageBubble, ...styles.assistantBubble}}>...</div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div style={styles.savedTripsContainer}>
            {currentUser && savedTrips.length > 0 && (
              <details>
                <summary style={styles.savedTripsSummary}>내 여행 목록 ({savedTrips.length})</summary>
                <div style={styles.savedTripsList}>
                  {savedTrips.map(trip => (
                    <div key={trip.id} style={styles.savedTripItem}>
                      <span>{trip.tripTitle}</span>
                      <div>
                        <button style={styles.loadButton} onClick={() => handleLoadTrip(trip)}>불러오기</button>
                        <button style={styles.deleteTripButton} onClick={() => handleDeleteTrip(trip.id)}>삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          <form onSubmit={handleSend} style={styles.chatInputForm}>
            <input
              ref={chatInputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={busy ? "응답을 기다리는 중..." : "여행 계획을 말씀해주세요."}
              style={styles.chatInput}
              disabled={busy}
              autoFocus
            />
            <button type="submit" disabled={busy} style={styles.sendButton}>전송</button>
          </form>
        </div>

        {/* Right Column: Trip Details & Map */}
        <div style={styles.tripColumn}>
          {/* Top-right global actions for starting a new trip */}
          <div style={{ position: 'absolute', top: 8, right: 20, display: 'flex', gap: 8, zIndex: 20 }}>
            <button
              onClick={() => {
                if (!confirm('현재 일정을 초기화하고 새로 시작하시겠습니까?')) return;
                setTripResult(null);
                setExtracted({});
                setCurrentTripId(null);
                autoGenDoneRef.current = false;
                setMsgs([
                  { role: 'assistant', content: '새 여행을 시작합니다! 목적지와 기간을 말씀해주세요.' }
                ]);
                setSelectedDay(null);
                localStorage.removeItem('tripdom-last-trip');
                localStorage.removeItem('tripdom-last-extracted');
                setError(null);
                setRestoredFromLocal(false);
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                background: '#0d6efd',
                color: '#fff',
                border: 'none',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.12)'
              }}
            >🔄 새 일정 시작</button>
          </div>
          {isLoading && (
            <div style={styles.tripLoading}>
              <div style={styles.travelAnimation}>
                <div style={styles.globe}>
                  <div style={styles.globeInner}>🌍</div>
                </div>
                <div style={styles.airplane}>✈️</div>
              </div>
              <p style={{ marginTop: '20px', fontSize: '16px', fontWeight: 500 }}>최고의 일정을 생성하고 있습니다...</p>
            </div>
          )}
          {error && !tripResult && (
            <div style={styles.tripError}>
              <p><strong>오류가 발생했습니다:</strong></p>
              <p>{error}</p>
              <button onClick={() => setError(null)} style={styles.authButton}>닫기</button>
            </div>
          )}

          {!isLoading && !tripResult && (
            <div style={styles.tripWelcome}>
              <h2>Tripdom에 오신 것을 환영합니다!</h2>
              <p>왼쪽 채팅창에 여행하고 싶은 곳과 기간을 알려주세요.</p>
              <p>예: "부산 2박 3일 여행"</p>
            </div>
          )}

          {tripResult && (
            <div style={styles.tripResultContainer} ref={printRef}>
              <TripSummaryBar
                trip={tripResult}
                meta={summaryMeta}
                budget={budgetStats}
                travelMode={travelMode}
                status={{ ready, busy, isLoading, error }}
                restoredFromLocal={restoredFromLocal}
                onDismissRestore={() => setRestoredFromLocal(false)}
                onClearError={() => setError(null)}
              />
              <div style={styles.tripHeader}>
                <h2>{tripResult.tripTitle}</h2>
                <div style={styles.tripMeta}>
                  <span>📍 {tripResult.destination}</span>
                  <span>🗓️ {tripResult.period}</span>
                  <span>🏷️ {tripResult.keywords}</span>
                </div>
                <div style={styles.tripActions}>
                  {currentUser && <button style={styles.primaryBtn} onClick={handleSaveTrip}>💾 저장</button>}
                  {currentUser && currentTripId && <button style={styles.primaryBtn} onClick={handleShare}>🔗 공유</button>}
                  <button style={styles.primaryBtn} onClick={handleExportPDF}>📄 PDF</button>
                  <button style={styles.outlineBtn} onClick={handleAutoBalanceCategories} disabled={isLoading}>
                    ⚖️ 카테고리 균형
                  </button>
                </div>
                {tripResult.destination && (() => {
                  const cityProfile = getCityProfile(tripResult.destination);
                  const cityDesc = getCityDescription(cityProfile);
                  const recommended = getRecommendedMode(cityProfile);
                  return (
                    <div style={{ fontSize: 12, color: '#666', marginTop: 8, padding: '8px 12px', backgroundColor: '#f0f8ff', borderRadius: 6 }}>
                      <strong>🌍 지역 정보:</strong> {cityDesc}
                      {recommended && ` | 추천 이동수단: ${recommended === 'DRIVE' ? '차량' : recommended === 'TRANSIT' ? '대중교통' : '도보'}`}
                    </div>
                  );
                })()}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 8 }}>
                  <label style={{ fontSize: 13 }}>
                    이동수단:
                    <select value={travelMode} onChange={(e) => setTravelMode(e.target.value)} style={{ marginLeft: 6 }}>
                      <option value="DRIVE">차량</option>
                      <option value="WALK">도보</option>
                      <option value="TRANSIT">대중교통</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 13 }}>
                    <input type="checkbox" checked={autoOptimizeAfterReplace} onChange={(e) => setAutoOptimizeAfterReplace(e.target.checked)} style={{ marginRight: 6 }} />
                    교체 후 자동 최적화
                  </label>
                  <label style={{ fontSize: 13 }}>
                    <input type="checkbox" checked={autoReassignAfterOptimize} onChange={(e) => setAutoReassignAfterOptimize(e.target.checked)} style={{ marginRight: 6 }} />
                    최적화 후 시간 재배열
                  </label>
                </div>
              </div>

              <div style={styles.tripBody}>
                <div style={styles.itineraryPane}>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    {tripResult.days.map((day, dayIndex) => (
                      <div key={day.day} style={styles.dayContainer}>
                        <div style={styles.dayHeaderRow}>
                          <div style={styles.dayTitleGroup}>
                            <h3 style={styles.dayTitle}>Day {day.day}</h3>
                            {typeof budgetStats.perDay[dayIndex] === 'number' && (
                              <span style={styles.dayBudget}>예상 {budgetStats.perDay[dayIndex].toLocaleString()}원</span>
                            )}
                          </div>
                          <div style={styles.dayActions}>
                             <button style={styles.outlineBtn} onClick={() => handleOptimizeRoute(dayIndex)} disabled={optimizingDay === dayIndex}>
                               {optimizingDay === dayIndex ? '최적화 중...' : '경로 최적화'}
                             </button>
                          </div>
                        </div>
                        <SortableContext items={day.itinerary.map(item => item.place + item.time)} strategy={verticalListSortingStrategy}>
                          <ul style={styles.itineraryList}>
                            {day.itinerary.map((item, itemIndex) => (
                              <SortableItem
                                key={`${item.place}-${item.time}`}
                                dayIndex={dayIndex}
                                itemIndex={itemIndex}
                                item={item}
                                handleDeleteItem={handleDeleteItem}
                                handleUpdateItem={handleUpdateItem}
                                onOpenAlternatives={openAlternatives}
                              />
                            ))}
                          </ul>
                        </SortableContext>
                        {addingPlaceToDayIndex === dayIndex ? (
                          <PlaceAutocomplete onPlaceSelect={handlePlaceAdd} styles={{}} centerLocation={getCenterLocation()} />
                        ) : (
                          <button style={styles.addPlaceButton} onClick={() => setAddingPlaceToDayIndex(dayIndex)}>
                            + 장소 추가
                          </button>
                        )}
                      </div>
                    ))}
                  </DndContext>
                </div>
                <div style={printing ? { ...styles.mapPane, display: 'none' } : styles.mapPane}>
                  <div style={styles.mapDayFilter}>
                    <button
                      onClick={() => setSelectedDay(null)}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid #ced4da',
                        borderRadius: 6,
                        background: selectedDay === null ? '#0d6efd' : '#ffffff',
                        color: selectedDay === null ? '#ffffff' : '#000000',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                      }}
                    >All</button>
                    {tripResult.days.map(d => {
                      const active = selectedDay === d.day;
                      return (
                        <button
                          key={d.day}
                          onClick={() => setSelectedDay(d.day)}
                          style={{
                            padding: '6px 12px',
                            border: '1px solid #ced4da',
                            borderRadius: 6,
                            background: active ? '#0d6efd' : '#ffffff',
                            color: active ? '#ffffff' : '#000000',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 600,
                            boxShadow: active ? '0 1px 4px rgba(0,0,0,0.12)' : '0 1px 2px rgba(0,0,0,0.05)'
                          }}
                        >Day {d.day}</button>
                      );
                    })}
                  </div>
                  <TripMap days={tripResult.days} selectedDay={selectedDay} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modals */}
        {showAuthModal && (
          <AuthModal
            onClose={() => setShowAuthModal(false)}
            onLoginSuccess={(token: string, autoLogin: boolean) => {
              const decoded: { userId: string, email: string, nickname: string } = jwtDecode(token);
              setCurrentUser({ id: decoded.userId, email: decoded.email, nickname: decoded.nickname });
              if (autoLogin) {
                localStorage.setItem('trip-planner-token', token);
                localStorage.setItem('trip-planner-remember', '1');
                sessionStorage.removeItem('trip-planner-token');
              } else {
                sessionStorage.setItem('trip-planner-token', token);
                localStorage.removeItem('trip-planner-remember');
              }
              setShowAuthModal(false);
              fetchSavedTrips();
            }}
          />
        )}
        {showShareModal && <ShareModal shareUrl={shareUrl} onClose={() => setShowShareModal(false)} />}
        <AlternativesModal
          open={altModalOpen}
          baseItem={altBaseItem}
          list={altList}
          page={altPage}
          total={altTotal}
          filters={altFilters}
          onApplyFilters={async (f: AltFilters) => {
            setAltFilters(f);
            if (altBaseItem) await fetchAlternatives(altBaseItem.latitude!, altBaseItem.longitude!, 1, f);
          }}
          onPage={async (p: number) => {
            if (altBaseItem) await fetchAlternatives(altBaseItem.latitude!, altBaseItem.longitude!, p, altFilters);
          }}
          onClose={() => setAltModalOpen(false)}
          onSelect={applyAlternative}
        />
      </div>
    </APIProvider>
  );
}


// --- STYLES ---

const SCALE = 1.0; // 전체 UI를 100% 크기로 유지

// 모든 숫자 값을 스케일에 맞게 조정하는 헬퍼 함수
const scaleValue = (value: string | number): string => {
  if (typeof value === 'number') return `${value * SCALE}px`;
  if (typeof value === 'string') {
    const match = value.match(/^(\d+(?:\.\d+)?)(px|rem|em)$/);
    if (match) {
      const [, num, unit] = match;
      return `${parseFloat(num) * SCALE}${unit}`;
    }
  }
  return value;
};

// 스타일 객체의 모든 크기 관련 속성을 스케일링
const scaleStyles = (styles: React.CSSProperties): React.CSSProperties => {
  const scaled: any = {};
  const sizeProps = ['fontSize', 'padding', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 
                     'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'gap', 'borderRadius',
                     'width', 'height', 'maxWidth', 'maxHeight', 'minWidth', 'minHeight', 'top', 'right', 'bottom', 'left'];
  
  for (const [key, value] of Object.entries(styles)) {
    if (sizeProps.includes(key) && (typeof value === 'string' || typeof value === 'number')) {
      scaled[key] = scaleValue(value);
    } else {
      scaled[key] = value;
    }
  }
  return scaled;
};

const rawStyles: { [key: string]: React.CSSProperties } = {
  pageContainer: {
    display: 'grid',
    gridTemplateColumns: '450px 1fr',
    height: '100vh',
    fontFamily: "'Pretendard', sans-serif",
    backgroundColor: '#f8f9fa',
  },
  chatColumn: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    borderRight: '1px solid #e9ecef',
    padding: '20px',
    height: '100vh',
    boxSizing: 'border-box',
    color: '#000000',
  },
  chatHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  chatTitle: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 800,
    color: '#1b1f24',
  },
  authContainer: {},
  authButton: {
    padding: '8px 12px',
    background: '#3b82f6',
    color: 'white',
    border: '1px solid #2b6ed6',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  chatMessagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 10px',
    marginBottom: '10px',
  },
  messageBubble: {
    maxWidth: '85%',
    padding: '14px 18px',
    // 개별 코너로 지정하여 userBubble/assistantBubble에서 일부 코너만 덮어쓸 때 충돌 방지
    borderTopLeftRadius: '18px',
    borderTopRightRadius: '18px',
    borderBottomRightRadius: '18px',
    borderBottomLeftRadius: '18px',
    lineHeight: 1.6,
    marginBottom: '14px',
    wordBreak: 'break-word',
    fontSize: '14px',
    letterSpacing: '-0.2px',
    whiteSpace: 'pre-line'
  },
  userBubble: {
    backgroundColor: '#d7ecff',
    color: '#000000',
    marginLeft: 'auto',
    borderBottomRightRadius: '4px',
  },
  assistantBubble: {
    background: 'linear-gradient(135deg,#f5f7fa 0%,#eef2f6 100%)',
    color: '#111',
    marginRight: 'auto',
    borderBottomLeftRadius: '4px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
    border: '1px solid #e3e7eb'
  },
  savedTripsContainer: {
    borderTop: '1px solid #e9ecef',
    paddingTop: '10px',
  },
  savedTripsSummary: {
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '14px',
    color: '#495057',
  },
  savedTripsList: {
    maxHeight: '150px',
    overflowY: 'auto',
    marginTop: '10px',
  },
  savedTripItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px',
    borderBottom: '1px solid #f1f3f5',
    fontSize: '14px',
  },
  loadButton: {
    padding: '4px 8px',
    fontSize: '12px',
    background: '#17a2b8',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  deleteTripButton: {
    padding: '4px 8px',
    fontSize: '12px',
    background: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    marginLeft: '8px',
  },
  chatInputForm: {
    display: 'flex',
    gap: '10px',
    marginTop: '10px',
  },
  chatInput: {
    flex: 1,
    padding: '12px',
    border: '1px solid #dee2e6',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#000000',
    backgroundColor: '#ffffff',
  },
  sendButton: {
    padding: '12px 16px',
    background: '#007bff',
    color: 'white',
    border: '1px solid #0067d6',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    boxShadow: '0 1px 2px rgba(0,0,0,0.08)'
  },
  tripColumn: {
    height: '100vh',
    overflowY: 'auto',
    padding: '20px',
    boxSizing: 'border-box',
    color: '#000000',
  },
  tripLoading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#495057',
  },
  travelAnimation: {
    position: 'relative',
    width: '200px',
    height: '200px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  globe: {
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 32px rgba(102, 126, 234, 0.3)',
    animation: 'rotateGlobe 8s linear infinite',
  },
  globeInner: {
    fontSize: '64px',
    animation: 'rotateGlobe 8s linear infinite',
  },
  airplane: {
    position: 'absolute',
    fontSize: '36px',
    animation: 'floatPlane 3s ease-in-out infinite',
    filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))',
  },
  tripError: {
    padding: '20px',
    margin: 'auto',
    maxWidth: '400px',
    textAlign: 'center',
    backgroundColor: '#f8d7da',
    borderRadius: '8px',
  },
  tripWelcome: {
    textAlign: 'center',
    margin: 'auto',
    color: '#495057',
  },
  tripResultContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  tripHeader: {
    marginBottom: '20px',
    paddingBottom: '20px',
    borderBottom: '1px solid #e9ecef',
  },
  tripMeta: {
    display: 'flex',
    gap: '16px',
    color: '#6c757d',
    marginTop: '10px',
  },
  tripActions: {
    display: 'flex',
    gap: '10px',
    marginTop: '15px',
  },
  primaryBtn: {
    padding: '8px 12px',
    background: '#0d6efd',
    color: '#fff',
    border: '1px solid #0b5ed7',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
  },
  outlineBtn: {
    padding: '8px 12px',
    background: '#ffffff',
    color: '#0d6efd',
    border: '1px solid #0d6efd',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600
  },
  totalBudgetText: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#1f7a2e',
    marginTop: '15px',
  },
  tripBody: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    minHeight: 0,
  },
  itineraryPane: {
    overflowY: 'auto',
    paddingRight: '10px',
  },
  mapPane: {
    position: 'sticky',
    top: '20px',
    height: 'calc(100vh - 60px)',
  },
  mapDayFilter: {
    display: 'flex',
    gap: '8px',
    marginBottom: '10px',
    flexWrap: 'wrap'
  },
  dayContainer: {
    background: '#ffffff',
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.08)',
    border: '1px solid #edf2f7',
    marginBottom: '30px',
  },
  dayHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: '8px',
  },
  dayTitleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  dayTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 700,
    color: '#1b1f24',
  },
  dayBudget: {
    fontSize: '13px',
    color: '#495057',
  },
  dayActions: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  itineraryList: {
    listStyle: 'none',
    padding: 0,
  },
  itineraryItem: {
    position: 'relative',
    marginBottom: '15px',
    background: 'white',
    padding: '15px',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    border: '1px solid #e9ecef',
  },
  itemHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '10px',
  },
  itemTime: {
    background: '#eef6ff',
    color: '#005fcc',
    padding: '5px 10px',
    borderRadius: '15px',
    marginRight: '10px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  placeName: {
    fontWeight: 'bold',
    fontSize: '16px',
    flex: 1,
  },
  dragHandle: {
    cursor: 'grab',
    padding: '5px',
    color: '#6c757d',
  },
  itemDescription: {
    margin: '8px 0',
    color: '#495057',
    fontSize: '14px',
    cursor: 'pointer',
    whiteSpace: 'pre-wrap',
  },
  inlineInput: {
    border: '1px solid #007bff',
    outline: 'none',
    background: '#eef6ff',
    width: '80px',
    textAlign: 'center',
  },
  inlineTextarea: {
    width: '100%',
    border: '1px solid #007bff',
    borderRadius: '4px',
    padding: '8px',
    fontSize: '14px',
    minHeight: '60px',
    resize: 'vertical',
  },
  itemReason: {
    margin: '8px 0',
    background: '#f1f3f5',
    padding: '8px',
    borderRadius: '4px',
    fontSize: '13px',
  },
  detailsContainer: {
    marginTop: '10px',
    fontSize: '13px',
    color: '#343a40',
  },
  detailItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '5px',
  },
  detailIcon: {
    fontSize: '16px',
  },
  expenseInput: {
    width: '100px',
    padding: '4px',
    border: '1px solid #007bff',
    borderRadius: '4px',
  },
  expenseText: {
    cursor: 'pointer',
    color: '#007bff',
    fontWeight: 'bold',
  },
  itemActions: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    display: 'flex',
    gap: '5px',
  },
  actionButton: {
    background: 'transparent',
    border: '1px solid #adb5bd',
    color: '#495057',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: '6px',
  },
  deleteButton: {
    background: 'transparent',
    border: 'none',
    color: '#dc3545',
    fontSize: '20px',
    cursor: 'pointer',
  },

  addPlaceButton: {
    width: '100%',
    padding: '10px',
    marginTop: '10px',
    border: '2px dashed #007bff',
    borderRadius: '8px',
    background: 'rgba(0, 123, 255, 0.05)',
    color: '#007bff',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
};

// 모든 스타일을 80% 스케일로 적용
const styles = Object.fromEntries(
  Object.entries(rawStyles).map(([key, value]) => [key, scaleStyles(value)])
);
