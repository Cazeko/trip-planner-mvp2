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
import { apiFetch } from '../lib/apiFetch';
import { SpeedInsights } from "@vercel/speed-insights/next"
import { generatePremiumPDF } from '../lib/pdfGenerator';

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
import TripAnalysis from '../components/TripAnalysis';
import { styles } from './styles';

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
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        {item.photoUrl && (
          <div style={{ flexShrink: 0, width: '120px', height: '80px', borderRadius: '8px', overflow: 'hidden', background: '#f0f0f0' }}>
            <img
              src={item.photoUrl}
              alt={item.place}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        )}
        <div style={{ flex: 1 }}>
          {isEditing.description ? <textarea value={editedContent.description} onChange={(e) => handleInputChange(e, 'description')} onBlur={() => handleSave('description')} onKeyDown={(e) => handleKeyDown(e, 'description')} autoFocus style={{ ...styles.itemDescription, ...styles.inlineTextarea }} onPointerDown={(e) => e.stopPropagation()} /> : <p style={styles.itemDescription} onClick={() => setIsEditing({ ...isEditing, description: true })} onPointerDown={(e) => e.stopPropagation()}>{sanitizeText(item.description) || '클릭하여 설명을 추가하세요...'}</p>}
        </div>
      </div>
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
  const [chatColumnOpen, setChatColumnOpen] = useState(true);
  const [autoReassignAfterOptimize, setAutoReassignAfterOptimize] = useState(true);
  const [showSummaryPanel, setShowSummaryPanel] = useState(true);
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(true);
  const [showMapPanel, setShowMapPanel] = useState(true);
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

  const CHAT_WIDTH = 450;
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');

    const update = () => setIsMobile(mq.matches);
    update();

    // Safari 호환
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    (mq as any).addListener?.(update);
    return () => (mq as any).removeListener?.(update);
  }, []);

  useEffect(() => {
    if (isMobile) setChatColumnOpen(false);
  }, [isMobile]);

  // 모바일에서는 지도 패널을 기본으로 숨겨 일정표가 먼저 보이도록 처리
  useEffect(() => {
    if (isMobile) setShowMapPanel(false);
  }, [isMobile]);

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
        // OAuth callback 처리: /?token=...&remember=1 또는 /?oauthError=...
        try {
          const url = new URL(window.location.href);
          const oauthToken = url.searchParams.get('token');
          const oauthRemember = url.searchParams.get('remember') === '1';
          const oauthError = url.searchParams.get('oauthError');

          if (oauthError) {
            setError(oauthError);
            url.searchParams.delete('oauthError');
            window.history.replaceState({}, '', url.toString());
          }

          if (oauthToken) {
            const decoded: { userId: string, email: string, nickname: string } = jwtDecode(oauthToken);
            setCurrentUser({ id: decoded.userId, email: decoded.email, nickname: decoded.nickname });

            if (oauthRemember) {
              localStorage.setItem('trip-planner-token', oauthToken);
              localStorage.setItem('trip-planner-remember', '1');
              sessionStorage.removeItem('trip-planner-token');
            } else {
              sessionStorage.setItem('trip-planner-token', oauthToken);
              localStorage.removeItem('trip-planner-remember');
            }

            url.searchParams.delete('token');
            url.searchParams.delete('remember');
            window.history.replaceState({}, '', url.toString());

            setShowAuthModal(false);
            fetchSavedTrips();
          }
        } catch {
          // ignore
        }
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
      const mode = Array.isArray(extracted.preferredTransportMulti) ? extracted.preferredTransportMulti[0] : extracted.preferredTransportMulti;
      if (typeof mode === 'string') setTravelMode(mode);
    } else if (extracted.preferredTransport) {
      const mode = Array.isArray(extracted.preferredTransport) ? extracted.preferredTransport[0] : extracted.preferredTransport;
      if (typeof mode === 'string') setTravelMode(mode);
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
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60초 타임아웃 (GPT 응답 대기 시간 연장)

      try {
        const data = await apiFetch('/api/ljj', { 
          method: 'POST', 
          body: JSON.stringify({ messages: withUser, extracted, trip: tripResult }),
          signal: controller.signal,
          timeout: 60000,
          friendlyError: 'AI 응답을 받아오지 못했습니다.'
        });
        clearTimeout(timeoutId);

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
        if (e.name === 'AbortError') {
          throw new Error('응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.');
        }
        throw e;
      } finally {
        clearTimeout(timeoutId);
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
    // setMsgs(prev => [...prev, { role: 'assistant', content: '알겠습니다! 최고의 일정을 생성하고 있어요. 잠시만 기다려주세요...' }]); // 중복 메시지 제거

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
      
      const data = await apiFetch('/api/generate-trip', {
        method: 'POST',
        body: JSON.stringify(body),
        timeout: 90000, // 90초
        retries: 1,
        friendlyError: '일정 생성 중 오류가 발생했습니다.'
      });
      
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
            const arr = await apiFetch('/api/optimize-route', {
              method: 'POST', 
              body: JSON.stringify({ itinerary: d.itinerary, travelMode }),
              timeout: 10000,
              retries: 0
            });
            
            if (Array.isArray(arr) && arr.length === d.itinerary.length) {
              console.log(`[최적화] Day ${dayIdx + 1} Google API 성공`);
              return { ...d, itinerary: scheduleWithDurations(arr, travelMode as TravelMode, destination) };
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

      // 썸네일 확인 로그
      console.log('[일정 생성] 썸네일 확인:', scheduledDays.flatMap(d => d.itinerary).filter(it => it.photoUrl).length, '개 발견');
      scheduledDays.forEach((d, idx) => {
        d.itinerary.forEach((it, i) => {
          if (it.photoUrl) console.log(`  Day ${idx + 1} Item ${i + 1}: ${it.place} -> ${it.photoUrl.substring(0, 80)}...`);
        });
      });
      
      setTripResult({ ...data, destination, period: extracted.period, keywords: extracted.keywords, days: scheduledDays });
      // 생성 중 메시지만 제거하고 기존 대화는 유지합니다.
      setMsgs(prev => prev.concat({ role: 'assistant', content: '일정이 생성되었습니다! 오른쪽에서 확인하고 수정할 수 있어요.' }));

    } catch (err: any) { 
      setError(err.message); 
      setMsgs(prev => [...prev, { role: 'assistant', content: `생성 중 오류가 발생했습니다: ${err.message}` }]);
    } finally { 
      setIsLoading(false); 
      setBusy(false);
    }
  };

  const handleOptimize = async (type: 'optimize_efficiency' | 'reduce_fatigue') => {
    if (!tripResult) return;
    
    try {
      setBusy(true);
      
      let optimizedTrip = { ...tripResult };
      
      if (type === 'optimize_efficiency') {
        // 각 일차별로 경로 최적화
        const optimizedDays = await Promise.all(
          tripResult.days.map(async (day, idx) => {
            if (day.itinerary.length < 3) return day;
            
            try {
              const arr = await apiFetch('/api/optimize-route', {
                method: 'POST',
                body: JSON.stringify({ itinerary: day.itinerary, travelMode }),
                timeout: 10000,
                friendlyError: '경로 최적화에 실패했어요',
              });
              
              if (Array.isArray(arr) && arr.length === day.itinerary.length) {
                return { ...day, itinerary: scheduleWithDurations(arr, travelMode as TravelMode, tripResult.destination) };
              }

              // API 응답이 기대 형태가 아니면 로컬 fallback 적용
              const optimizedByDistance = optimizeByNearestNeighbor(day.itinerary);
              return { ...day, itinerary: scheduleWithDurations(optimizedByDistance, travelMode as TravelMode, tripResult.destination) };
            } catch (err) {
              console.error(`Day ${idx + 1} optimization failed:`, err);

              // 오류 시에도 로컬 fallback 적용
              const optimizedByDistance = optimizeByNearestNeighbor(day.itinerary);
              return { ...day, itinerary: scheduleWithDurations(optimizedByDistance, travelMode as TravelMode, tripResult.destination) };
            }
            
            return day;
          })
        );
        
        optimizedTrip.days = optimizedDays;
        setMsgs(prev => [...prev, { role: 'assistant', content: '✅ 이동 경로를 최적화했어요! 효율성이 개선되었습니다.' }]);
      } else if (type === 'reduce_fatigue') {
        // 피로도 감소: 장소 수 제한하되 저녁 식사는 유지
        const relaxedDays = tripResult.days.map(day => {
          let itinerary = [...day.itinerary];
          
          // 시간대별 분류
          const breakfast = itinerary.filter(item => {
            const h = parseInt(item.time.split(':')[0]);
            return h >= 9 && h < 11;
          });
          const lunch = itinerary.filter(item => {
            const h = parseInt(item.time.split(':')[0]);
            return h >= 12 && h < 14;
          });
          const afternoon = itinerary.filter(item => {
            const h = parseInt(item.time.split(':')[0]);
            return h >= 14 && h < 18;
          });
          const dinner = itinerary.filter(item => {
            const h = parseInt(item.time.split(':')[0]);
            return h >= 18 && h < 21;
          });
          
          // 필수 유지: 아침(1개), 점심(1개), 오후(1-2개), 저녁(1개)
          let reduced = [
            ...breakfast.slice(0, 1),
            ...lunch.slice(0, 1),
            ...afternoon.slice(0, 2),
            ...dinner.slice(0, 1), // 저녁 식사 반드시 포함
          ];
          
          // 시간순 정렬
          reduced.sort((a, b) => a.time.localeCompare(b.time));
          
          // 시작 시간 늦춤 (10시 이후로)
          reduced = reduced.map(item => {
            const [h, m] = item.time.split(':').map(Number);
            if (h < 10) {
              return { ...item, time: `10:${m.toString().padStart(2, '0')}` };
            }
            return item;
          });
          
          return { ...day, itinerary: scheduleWithDurations(reduced, travelMode as TravelMode, tripResult.destination) };
        });
        
        optimizedTrip.days = relaxedDays;
        setMsgs(prev => [...prev, { role: 'assistant', content: '✅ 일정을 여유롭게 조정했어요! 저녁 식사까지 포함하여 피로도를 줄였습니다.' }]);
      }
      
      setTripResult(optimizedTrip);
    } catch (err) {
      console.error('Optimization error:', err);
      setMsgs(prev => [...prev, { role: 'assistant', content: '최적화 중 문제가 발생했어요.' }]);
    } finally {
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
        const data = await apiFetch('/api/ai/modify-trip', {
          method: 'POST',
          body: JSON.stringify({ messages: withUser, extracted, trip: tripResult }),
          timeout: 60000,
          retries: 0
        });
        
        if (data?.trip) {
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
          keywords: typeof tripResult.keywords === 'string' ? tripResult.keywords : '',
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
      const placeDetails = await apiFetch('/api/get-place-details', { 
        method: 'POST', 
        body: JSON.stringify({ placeId }),
        timeout: 10000,
        friendlyError: '장소 정보를 가져오지 못했습니다.'
      });
      
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
          const optimizedItinerary = await apiFetch('/api/optimize-route', { 
            method: 'POST', 
            body: JSON.stringify({ itinerary: itineraryToOptimize, travelMode }),
            timeout: 10000,
            retries: 0
          });
          
          if (Array.isArray(optimizedItinerary) && optimizedItinerary.length === itineraryToOptimize.length) {
            console.log('[수동 최적화] Google API 성공');
            finalItinerary = optimizedItinerary;
          } else {
            throw new Error('API 응답 형식 오류');
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

  const fetchAlternatives = async (lat: number, lng: number, page: number, filters: AltFilters, baseItem?: ItineraryItem) => {
    try {
      const data = await apiFetch('/api/nearby-suggestions', {
        method: 'POST',
        body: JSON.stringify({ 
          lat, 
          lng, 
          count: 6, 
          page, 
          pageSize: 6, 
          minRating: filters.minRating, 
          openNow: filters.openNow, 
          categories: filters.categories,
          basePlaceName: baseItem?.place || altBaseItem?.place,
          baseTypes: baseItem?.types || altBaseItem?.types
        }),
        timeout: 15000,
        friendlyError: '대안 검색 실패'
      });

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
    await fetchAlternatives(item.latitude, item.longitude, 1, altFilters, item);
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

  const handleExportPDF = async () => {
    if (!tripResult) { alert('내보낼 일정이 없습니다.'); return; }
    
    try {
      // Normalize data for backend
      const keywords = Array.isArray(tripResult.keywords) 
        ? tripResult.keywords.join(', ') 
        : (tripResult.keywords || '');
      
      const travelType = Array.isArray(summaryMeta.travelType)
        ? summaryMeta.travelType[0]
        : summaryMeta.travelType;
      
      const transport = Array.isArray(summaryMeta.preferredTransport)
        ? summaryMeta.preferredTransport
        : summaryMeta.preferredTransport ? [summaryMeta.preferredTransport] : [];
      
      // Use server-side PDF generation for better Korean font support
      const payload = {
        trip: {
          ...tripResult,
          keywords, // Ensure it's a string
        },
        meta: {
          travelType, // Single value, not array
          preferredTransportMulti: transport.length > 0 ? transport : undefined,
          travelMode: Array.isArray(travelMode) ? travelMode[0] : travelMode,
        },
      };

      const response = await fetch('/api/pdf/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || '서버에서 PDF 생성 실패');
      }
      
      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tripResult.tripTitle || 'trip'}_premium.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
    } catch (err: any) {
      console.error('[PDF] Server-side generation failed', err);

      // Fallback: client-side generation (works even if backend lacks /pdf/generate)
      try {
        const ok = await generatePremiumPDF(tripResult as TripData);
        if (ok) return;
      } catch (fallbackErr) {
        console.error('[PDF] Client-side fallback failed', fallbackErr);
      }

      alert(`PDF 생성 실패: ${err?.message || err}`);
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
      <div
        style={
          isMobile
            ? {
                ...styles.pageContainer,
                flexDirection: 'column',
                height: '100svh',
              }
            : styles.pageContainer
        }
      >
        {/* Toggle Chat Button - Outside chat column */}
        <button
          onClick={() => setChatColumnOpen(!chatColumnOpen)}
          style={{
            position: 'fixed',
            ...(isMobile
              ? {
                  right: '12px',
                  bottom: '12px',
                  left: 'auto',
                  top: 'auto',
                  transform: 'none',
                }
              : {
                  left: chatColumnOpen ? `${CHAT_WIDTH}px` : '8px',
                  top: '50%',
                  // When open: center the button on the sidebar boundary.
                  // When closed: keep it fully visible with a small left margin.
                  transform: chatColumnOpen ? 'translate(-50%, -50%)' : 'translateY(-50%)',
                }),
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            fontSize: 16,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 40,
            transition: isMobile
              ? 'transform var(--ios-dur) var(--ios-ease)'
              : 'left var(--ios-dur) var(--ios-ease), transform var(--ios-dur) var(--ios-ease)',
          }}
          title={chatColumnOpen ? '채팅 닫기' : '채팅 열기'}
        >
          {chatColumnOpen ? '‹' : '›'}
        </button>
        {/* Left Column: Chat */}
        <div
          style={
            isMobile
              ? {
                  position: 'fixed',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: '100vw',
                  height: '100svh',
                  zIndex: 30,
                  pointerEvents: chatColumnOpen ? 'auto' : 'none',
                }
              : {
                  position: 'relative',
                  height: '100vh',
                  flex: chatColumnOpen ? `0 0 ${CHAT_WIDTH}px` : '0 0 0px',
                  transition: 'flex-basis var(--ios-dur) var(--ios-ease)',
                }
          }
        >
          <div
            style={
              isMobile
                ? {
                    ...styles.chatColumn,
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '100vw',
                    height: '100svh',
                    borderRight: '1px solid #e9ecef',
                    boxShadow: (styles.chatColumn as any).boxShadow,
                    transform: chatColumnOpen ? 'translateX(0)' : 'translateX(-100%)',
                    transition: 'transform var(--ios-dur) var(--ios-ease)',
                    overflow: 'hidden',
                    paddingBottom: 'env(safe-area-inset-bottom, 16px)',
                  }
                : {
                    ...styles.chatColumn,
                    width: `${CHAT_WIDTH}px`,
                    minWidth: `${CHAT_WIDTH}px`,
                    transition: 'transform var(--ios-dur) var(--ios-ease)',
                    overflow: 'hidden',
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    flexShrink: 0,
                    pointerEvents: chatColumnOpen ? 'auto' : 'none',
                    transform: chatColumnOpen ? 'translateX(0)' : `translateX(-${CHAT_WIDTH}px)`,
                  }
            }
          >
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
        </div>

        {/* Right Column: Trip Details & Map */}
        <div
          style={
            isMobile
              ? {
                  ...styles.tripColumn,
                  padding: '16px',
                  height: '100vh',
                }
              : styles.tripColumn
          }
        >
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
            <div style={{ ...styles.tripWelcome, maxWidth: 840, width: '100%' }}>
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 20,
                  padding: '28px 28px 22px',
                  boxShadow: '0 18px 50px rgba(15, 23, 42, 0.06)',
                }}
              >
                <h2 style={{ ...styles.welcomeTitle, marginBottom: 12 }}>어디로 떠나시나요?</h2>
                <p style={{ ...styles.welcomeText, marginBottom: 18 }}>
                  Tripdom AI가 당신만을 위한 완벽한 여행 일정을 설계해드립니다.<br />
                  목적지와 기간만 알려주세요.
                </p>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {['제주도 2박 3일 힐링 여행', '오사카 3박 4일 맛집 투어', '파리 5박 6일 예술 기행', '뉴욕 4박 5일 쇼핑 여행'].map((prompt, idx) => (
                    <button
                      key={idx}
                      style={styles.quickPromptChip}
                      onClick={() => {
                        setInput(prompt);
                        setChatColumnOpen(true);
                        setTimeout(() => chatInputRef.current?.focus(), 120);
                      }}
                    >
                      ✨ {prompt}
                    </button>
                  ))}
                </div>

                {/* Simple Features */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 18,
                    marginTop: 22,
                    paddingTop: 18,
                    borderTop: '1px solid #f1f5f9',
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 34, marginBottom: 8 }}>🎯</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>AI 맞춤 일정</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>목적지/기간만 알려주세요</div>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 34, marginBottom: 8 }}>⏱️</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>자동 최적화</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>효율적인 동선으로 배치</div>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 34, marginBottom: 8 }}>💰</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>예산 관리</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>실시간 비용 추적/요약</div>
                  </div>
                </div>

                {/* Mini Cards */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: 14,
                    marginTop: 18,
                  }}
                >
                  <div
                    style={{
                      textAlign: 'left',
                      padding: '14px 16px',
                      borderRadius: 14,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
                      말하는 법 (예시)
                    </div>
                    <div style={{ display: 'grid', gap: 8, fontSize: 13, color: '#475569', lineHeight: 1.45 }}>
                      <div>• “부산 2박 3일, 맛집+바다, 아이와 함께”</div>
                      <div>• “도쿄 3박 4일, 쇼핑 중심, 대중교통”</div>
                      <div>• “제주 1박 2일, 렌트카, 여유롭게”</div>
                    </div>
                  </div>

                  <div
                    style={{
                      textAlign: 'left',
                      padding: '14px 16px',
                      borderRadius: 14,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>
                      결과 미리보기
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {[
                        { t: '10:00', p: '숙소 체크인/이동' },
                        { t: '12:00', p: '점심 & 주변 산책' },
                        { t: '15:00', p: '핵심 명소 1곳' },
                      ].map((row, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 10px',
                            borderRadius: 10,
                            background: '#ffffff',
                            border: '1px solid #eef2f7',
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 800, color: '#2563eb', width: 48 }}>{row.t}</div>
                          <div style={{ fontSize: 13, color: '#334155' }}>{row.p}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 14, fontSize: 12.5, color: '#64748b' }}>
                  Tip) “대중교통/도보/차량”을 함께 말해주면 더 정확해요.
                </div>
              </div>
            </div>
          )}

          {tripResult && (
            <div style={styles.tripResultContainer} ref={printRef}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowSummaryPanel(v => !v)}
                  style={{
                    ...styles.outlineBtn,
                    background: showSummaryPanel ? '#0d6efd' : '#ffffff',
                    color: showSummaryPanel ? '#ffffff' : '#475569',
                    border: `1px solid ${showSummaryPanel ? '#0d6efd' : '#cbd5e1'}`,
                  }}
                >요약</button>
                <button
                  type="button"
                  onClick={() => setShowAnalysisPanel(v => !v)}
                  style={{
                    ...styles.outlineBtn,
                    background: showAnalysisPanel ? '#0d6efd' : '#ffffff',
                    color: showAnalysisPanel ? '#ffffff' : '#475569',
                    border: `1px solid ${showAnalysisPanel ? '#0d6efd' : '#cbd5e1'}`,
                  }}
                >일정분석</button>
                <button
                  type="button"
                  onClick={() => setShowMapPanel(v => !v)}
                  style={{
                    ...styles.outlineBtn,
                    background: showMapPanel ? '#0d6efd' : '#ffffff',
                    color: showMapPanel ? '#ffffff' : '#475569',
                    border: `1px solid ${showMapPanel ? '#0d6efd' : '#cbd5e1'}`,
                  }}
                >지도</button>
              </div>

              {showSummaryPanel && (
                <TripSummaryBar
                  trip={tripResult}
                  meta={summaryMeta}
                  budget={budgetStats}
                  travelMode={travelMode}
                  status={{ ready, busy, isLoading, error }}
                  restoredFromLocal={restoredFromLocal}
                  onDismissRestore={() => setRestoredFromLocal(false)}
                  onClearError={() => setError(null)}
                  onNewTrip={() => {
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
                  extra={(
                    <>
                      <div style={styles.tripActions}>
                        {currentUser ? (
                          <>
                            <button style={styles.primaryBtn} onClick={handleSaveTrip}>
                              <span>💾</span> 저장하기
                            </button>
                            {currentTripId && (
                              <button style={styles.outlineBtn} onClick={handleShare}>
                                <span>🔗</span> 공유하기
                              </button>
                            )}
                          </>
                        ) : (
                          <button style={styles.primaryBtn} onClick={() => setShowAuthModal(true)}>
                            <span>🔒</span> 로그인하여 저장
                          </button>
                        )}

                        <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 8px' }}></div>

                        <button style={styles.outlineBtn} onClick={handleExportPDF}>
                          <span>📄</span> PDF 다운로드
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
                          <select value={Array.isArray(travelMode) ? travelMode[0] : (travelMode || 'DRIVE')} onChange={(e) => setTravelMode(e.target.value)} style={{ marginLeft: 6 }}>
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
                    </>
                  )}
                />
              )}

              {showAnalysisPanel && (
                <TripAnalysis trip={tripResult} travelMode={travelMode as TravelMode} onOptimize={handleOptimize} />
              )}

              <div style={isMobile ? { ...styles.tripBody, flexDirection: 'column' } : styles.tripBody}>
                <div
                  style={
                    isMobile
                      ? { ...styles.itineraryPane, paddingRight: 0 }
                      : styles.itineraryPane
                  }
                >
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
                <div
                  style={printing
                    ? { ...styles.mapPane, display: 'none' }
                    : isMobile
                      ? {
                          ...styles.mapPane,
                          position: 'relative',
                          top: 'auto',
                          width: '100%',
                          marginLeft: 0,
                          marginTop: 12,
                          height: '50vh',
                          display: showMapPanel ? 'flex' : 'none',
                        }
                      : {
                          ...styles.mapPane,
                          flex: '0 0 auto',
                          flexBasis: showMapPanel ? 'min(420px, 34vw)' : '0px',
                          minWidth: showMapPanel ? '300px' : '0px',
                          marginLeft: showMapPanel ? '16px' : '0px',
                          opacity: showMapPanel ? 1 : 0,
                          transform: showMapPanel ? 'translateX(0)' : 'translateX(16px)',
                          pointerEvents: showMapPanel ? 'auto' : 'none',
                          border: showMapPanel ? (styles.mapPane as any).border : '0px solid transparent',
                          boxShadow: showMapPanel ? (styles.mapPane as any).boxShadow : 'none',
                          borderRadius: showMapPanel ? (styles.mapPane as any).borderRadius : 0,
                          transition:
                            'flex-basis var(--ios-dur) var(--ios-ease), margin-left var(--ios-dur) var(--ios-ease), opacity var(--ios-dur) var(--ios-ease), transform var(--ios-dur) var(--ios-ease), box-shadow var(--ios-dur) var(--ios-ease), border-radius var(--ios-dur) var(--ios-ease)',
                          willChange: 'flex-basis, margin-left, opacity, transform',
                        }}
                >
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
                    <div style={{ flex: 1, minHeight: 0 }}>
                      <TripMap days={tripResult.days} selectedDay={selectedDay} />
                    </div>
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








