// app/page.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { APIProvider } from '@vis.gl/react-google-maps';
import { jwtDecode } from 'jwt-decode';
import { authFetch, getStoredToken, clearStoredToken, ensureFreshToken } from '../lib/authClient';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import TripMap from '../components/TripMap';
import type { TripData, ItineraryItem, Day } from '../types/trip';
import PlaceAutocomplete from '../components/PlaceAutocomplete';
import AuthModal from '../components/AuthModal';
import ShareModal from '../components/ShareModal';
import AlternativesModal, { type AltFilters } from '../components/AlternativesModal';
import { scheduleWithDurations, type TravelMode } from '../lib/scheduling';

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

// 토큰 저장 유틸리티: sessionStorage 우선(자동로그인 미체크), 없으면 localStorage(자동로그인 체크)
// 토큰 유틸은 lib/authClient 사용

const SortableItem = ({ dayIndex, itemIndex, item, handleDeleteItem, handleUpdateItem, styles, onOpenAlternatives }: { dayIndex: number, itemIndex: number, item: ItineraryItem, handleDeleteItem: Function, handleUpdateItem: Function, styles: any, onOpenAlternatives?: (dayIndex: number, itemIndex: number, item: ItineraryItem) => void }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.place + item.time });
  const style = { transform: CSS.Transform.toString(transform), transition, ...styles.itineraryItem };
  
  const [isEditing, setIsEditing] = useState({ time: false, description: false, expense: false });
  const [editedContent, setEditedContent] = useState({ time: item.time, description: item.description, expense: item.expense || '' });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, field: 'time' | 'description' | 'expense') => {
    setEditedContent({ ...editedContent, [field]: e.target.value });
  };
  
  const handleSave = (field: 'time' | 'description' | 'expense') => {
    const valueToSave = field === 'expense' ? parseFloat(editedContent.expense.toString()) || 0 : editedContent[field];
    handleUpdateItem(dayIndex, itemIndex, field, valueToSave);
    setIsEditing({ ...isEditing, [field]: false });
  };

  const handleKeyDown = (e: React.KeyboardEvent, field: 'time' | 'description' | 'expense') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave(field);
    } else if (e.key === 'Escape') {
      const originalValue = field === 'expense' ? item.expense || '' : item[field];
      setEditedContent({ ...editedContent, [field]: originalValue });
      setIsEditing({ ...isEditing, [field]: false });
    }
  };

  return (
    <li ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <button style={styles.deleteButton} onPointerDown={(e) => e.stopPropagation()} onClick={() => handleDeleteItem(dayIndex, itemIndex)}>&times;</button>
      <button style={styles.altButton} onPointerDown={(e) => e.stopPropagation()} onClick={() => onOpenAlternatives && onOpenAlternatives(dayIndex, itemIndex, item)}>대안</button>
      <div style={styles.itemHeader}>
        {isEditing.time ? <input type="text" value={editedContent.time} onChange={(e) => handleInputChange(e, 'time')} onBlur={() => handleSave('time')} onKeyDown={(e) => handleKeyDown(e, 'time')} autoFocus style={{ ...styles.itemTime, ...styles.inlineInput }} onPointerDown={(e) => e.stopPropagation()} /> : <span style={styles.itemTime} onClick={() => setIsEditing({ ...isEditing, time: true })} onPointerDown={(e) => e.stopPropagation()}>{item.time}</span>}
        <span style={styles.placeName}>{item.place}</span>
      </div>
      {isEditing.description ? <textarea value={editedContent.description} onChange={(e) => handleInputChange(e, 'description')} onBlur={() => handleSave('description')} onKeyDown={(e) => handleKeyDown(e, 'description')} autoFocus style={{ ...styles.itemDescription, ...styles.inlineTextarea }} onPointerDown={(e) => e.stopPropagation()} /> : <p style={styles.itemDescription} onClick={() => setIsEditing({ ...isEditing, description: true })} onPointerDown={(e) => e.stopPropagation()}>{item.description || '클릭하여 설명을 추가하세요...'}</p>}
      {item.reason && <p style={styles.itemReason}>👍 **추천 이유:** {item.reason}</p>}
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
        <p style={styles.detailItem}><span style={styles.detailIcon}>📍</span> <strong>주소:</strong> {item.formattedAddress || '정보 없음'}</p>
        <p style={styles.detailItem}><span style={styles.detailIcon}>📞</span> <strong>전화번호:</strong> {item.internationalPhoneNumber || '정보 없음'}</p>
        <p style={styles.detailItem}><span style={styles.detailIcon}>⭐</span> <strong>평점:</strong> {item.rating || '정보 없음'}</p>
        {item.regularOpeningHours?.weekdayDescriptions && (<p style={styles.detailItem}><span style={styles.detailIcon}>⏰</span> <strong>영업시간:</strong> {item.regularOpeningHours.weekdayDescriptions[0] || '정보 없음'}</p>)}
        {item.websiteUri && (<p style={styles.detailItem}><span style={styles.detailIcon}>🌐</span> <a href={item.websiteUri} target="_blank" rel="noopener noreferrer" style={styles.websiteLink}>웹사이트 방문</a></p>)}
      </div>
    </li>
  );
};

export default function Home() {
  const [destination, setDestination] = useState('부산');
  const [period, setPeriod] = useState('2박 3일');
  const [keywords, setKeywords] = useState('맛집, 바다, 카페');
  // 여행 타입/예산/포함/제외/선호 교통 모드
  const [travelType, setTravelType] = useState<'standard' | 'family' | 'couple' | 'roadtrip' | 'relaxed' | 'intense'>('standard');
  const [budgetMode, setBudgetMode] = useState<'economy' | 'standard' | 'premium'>('standard');
  const [includeText, setIncludeText] = useState<string>('');
  const [excludeText, setExcludeText] = useState<string>('');
  const [preferredTransport, setPreferredTransport] = useState<'DRIVE' | 'TRANSIT' | 'WALK'>('DRIVE');
  // 고급 옵션 상태
  const [catPrefs, setCatPrefs] = useState<{ [k: string]: string }>({
    breakfast: '',
    lunch: '',
    dinner: '',
    dessert: '',
    late_night: ''
  });
  const [preferenceLimits, setPreferenceLimits] = useState<{ [k: string]: number | '' }>({
    breakfast: '',
    lunch: '',
    dinner: '',
    dessert: '',
    late_night: ''
  });
  const [rotationEnabled, setRotationEnabled] = useState<boolean>(false);
  const [tripResult, setTripResult] = useState<TripData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingPlaceToDayIndex, setAddingPlaceToDayIndex] = useState<number | null>(null);
  const [optimizingDay, setOptimizingDay] = useState<number | null>(null);
  const [travelMode, setTravelMode] = useState('DRIVE');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  
  const [currentTripId, setCurrentTripId] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // 대안 모달 및 최적화/재배정 토글 상태
  const [altModalOpen, setAltModalOpen] = useState(false);
  const [altBaseItem, setAltBaseItem] = useState<ItineraryItem | null>(null);
  const [altDayIndex, setAltDayIndex] = useState<number | null>(null);
  const [altItemIndex, setAltItemIndex] = useState<number | null>(null);
  const [altList, setAltList] = useState<any[]>([]);
  const [altTotal, setAltTotal] = useState(0);
  const [altPage, setAltPage] = useState(1);
  const [altFilters, setAltFilters] = useState<AltFilters>({ minRating: 4.0, openNow: false, categories: [] });
  const [autoOptimizeAfterReplace, setAutoOptimizeAfterReplace] = useState(true);
  const [autoReassignAfterOptimize, setAutoReassignAfterOptimize] = useState(true);

  const printRef = useRef<HTMLDivElement | null>(null);

  // /ljj에서 생성한 것을 불러오기
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ljj-latest-trip');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.days && Array.isArray(parsed.days)) {
          setTripResult({ ...parsed, destination: parsed.destination || destination, period: parsed.period || period, keywords: parsed.keywords || keywords });
          // 한 번만 사용
          localStorage.removeItem('ljj-latest-trip');
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExportPDF = async () => {
    if (!printRef.current || !tripResult) return;
    
    try {
      setIsExporting(true);

      // PDF 문서 설정
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);
      const contentHeight = pageHeight - (margin * 2);
      
      // PDF 스타일 정의
      const styles = {
        container: {
          width: '595px', // A4 너비에 맞춤
          padding: '20px',
          boxSizing: 'border-box',
          background: '#ffffff',
          fontFamily: 'Arial, sans-serif',
          color: '#333333' // 기본 텍스트 색상
        },
        title: {
          fontSize: '24px',
          textAlign: 'center',
          color: '#1a73e8',
          marginBottom: '15px',
          fontWeight: 'bold'
        },
        summary: {
          fontSize: '14px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #e0e0e0',
          color: '#333333'
        },
        dayHeader: {
          backgroundColor: '#1a73e8',
          color: '#ffffff',
          padding: '12px 15px',
          borderRadius: '6px',
          marginBottom: '15px',
          fontSize: '16px',
          fontWeight: 'bold'
        },
        itemCard: {
          backgroundColor: '#ffffff',
          border: '1px solid #e0e0e0',
          borderRadius: '6px',
          padding: '12px',
          marginBottom: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          color: '#333333'
        },
        timeLabel: {
          backgroundColor: '#1a73e8',
          color: '#ffffff',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '14px',
          marginRight: '8px',
          fontWeight: 'bold'
        },
        details: {
          color: '#555555',
          fontSize: '13px',
          marginTop: '8px',
          backgroundColor: '#f8f9fa',
          padding: '8px',
          borderRadius: '4px'
        },
        label: {
          color: '#1a73e8',
          fontWeight: 'bold',
          marginRight: '4px'
        }
      };

      // 헤더 요소 생성 및 문서에 추가
      const headerElement = document.createElement('div');
      document.body.appendChild(headerElement);

      // 기본 스타일 적용
      Object.assign(headerElement.style, styles.container);
      headerElement.style.position = 'absolute';
      headerElement.style.left = '-9999px';
      
      const totalBudget = tripResult.days.reduce((total, day) => {
        return total + day.itinerary.reduce((sum, item) => sum + (item.expense || 0), 0);
      }, 0);

      // 심플 템플릿: 타이틀 & 요약
      const titleSection = document.createElement('div');
      Object.assign(titleSection.style, styles.title);
      titleSection.textContent = tripResult.tripTitle;
      headerElement.appendChild(titleSection);

      // 여행 정보 요약
      const summarySection = document.createElement('div');
      Object.assign(summarySection.style, styles.summary);
      summarySection.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="font-weight: bold;">📍 목적지:</span>
          <span>${tripResult.destination}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="font-weight: bold;">⏱️ 기간:</span>
          <span>${tripResult.period}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="font-weight: bold;">🏷️ 키워드:</span>
          <span>${tripResult.keywords}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 15px; padding-top: 10px; border-top: 1px solid #e0e0e0;">
          <span style="font-weight: bold;">💰 총 예상 경비:</span>
          <span style="color: #1a73e8; font-weight: bold;">${totalBudget.toLocaleString()}원</span>
        </div>
      `;
      headerElement.appendChild(summarySection);

      // 헤더 캡처 및 PDF 추가
      const headerCanvas = await html2canvas(headerElement, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: true, // 디버깅을 위해 로깅 활성화
        useCORS: true,
        allowTaint: true
      });

      // 임시 요소 제거
      document.body.removeChild(headerElement);

      const headerImgData = headerCanvas.toDataURL('image/jpeg', 1.0);
      const headerImgWidth = contentWidth;
      const headerImgHeight = (headerCanvas.height * headerImgWidth) / headerCanvas.width;
      
      doc.addImage(headerImgData, 'JPEG', margin, margin, headerImgWidth, headerImgHeight);

      // 각 Day별로 페이지 생성
      for (let i = 0; i < tripResult.days.length; i++) {
        const day = tripResult.days[i];
        // 첫 번째 Day는 헤더 아래에 배치 시도, 그 외에는 새 페이지에서 시작
        if (i > 0) {
          doc.addPage();
        }

        // (심플 템플릿 전용) 썸네일/포토 기능 제거 - 단순 텍스트/상세 중심 PDF 생성

        // Day 컨테이너 생성
        const dayElement = document.createElement('div');
        document.body.appendChild(dayElement);
        
        // 기본 스타일 설정
        Object.assign(dayElement.style, styles.container);
        dayElement.style.position = 'absolute';
        dayElement.style.left = '-9999px';
        
  // Day 헤더 및 컨테이너 (템플릿별 분기)
  const dailyTotal = day.itinerary.reduce((sum, item) => sum + (item.expense || 0), 0);
  let itemsContainer: HTMLDivElement;
  // Simple day header and items container
  const dayHeader = document.createElement('div');
  Object.assign(dayHeader.style, styles.dayHeader);
  dayHeader.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; background-color: #f0f4f8; padding: 10px; border-radius: 8px;">
      <span style="font-size: 18px; font-weight: bold; color: #2c5282;">Day ${day.day}</span>
      <span style="font-size: 14px; color: #1a4785;">일일 경비: ${dailyTotal.toLocaleString()}원</span>
    </div>
  `;
  dayElement.appendChild(dayHeader);

  // 일정 아이템 컨테이너
  itemsContainer = document.createElement('div');
  itemsContainer.style.marginTop = '20px';
        
        // 각 일정 아이템 생성
        for (const item of day.itinerary) {
          const itemCard = document.createElement('div');
          Object.assign(itemCard.style, {
            ...styles.itemCard,
            backgroundColor: '#ffffff',
            padding: '20px',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            marginBottom: '20px',
            border: '1px solid #e5e7eb',
          });
          
          // 썸네일 기능 제거: 심플 텍스트/상세 중심 카드만 표시

          // 시간과 장소 헤더
          const headerDiv = document.createElement('div');
          Object.assign(headerDiv.style, {
            display: 'flex',
            alignItems: 'center',
            marginBottom: '15px',
            borderBottom: '1px solid #e2e8f0',
            paddingBottom: '12px',
            gap: '15px',
          });
          
          const timeSpan = document.createElement('span');
          Object.assign(timeSpan.style, styles.timeLabel);
          timeSpan.textContent = item.time;
          
          const placeSpan = document.createElement('span');
          placeSpan.style.fontSize = '16px';
          placeSpan.style.fontWeight = 'bold';
          placeSpan.textContent = item.place;
          
          headerDiv.appendChild(timeSpan);
          headerDiv.appendChild(placeSpan);
          itemCard.appendChild(headerDiv);
          
          // 설명 추가
          if (item.description) {
            const descDiv = document.createElement('div');
            descDiv.style.margin = '8px 0';
            descDiv.style.color = '#555';
            descDiv.style.fontSize = '14px';
            descDiv.textContent = item.description;
            itemCard.appendChild(descDiv);
          }
          
          // 상세 정보 컨테이너
          const detailsDiv = document.createElement('div');
          detailsDiv.style.marginTop = '8px';
          detailsDiv.style.fontSize = '13px';
          detailsDiv.style.color = '#666';
          
          // 경비 정보 (항상 표시, 없으면 '정보 없음')
          const expenseDiv = document.createElement('div');
          expenseDiv.style.marginBottom = '6px';
          expenseDiv.innerHTML = `<span style="color: #1a73e8;">💰</span> <strong>경비:</strong> ${item.expense ? item.expense.toLocaleString() + '원' : '<span style="color:#999">정보 없음</span>'}`;
          detailsDiv.appendChild(expenseDiv);

          // 주소 정보 (항상 표시)
          const addressDiv = document.createElement('div');
          addressDiv.style.marginBottom = '6px';
          addressDiv.innerHTML = `<span style="color: #1a73e8;">📍</span> <strong>주소:</strong> ${item.formattedAddress ? item.formattedAddress : '<span style="color:#999">정보 없음</span>'}`;
          detailsDiv.appendChild(addressDiv);

          // 전화번호 (항상 표시)
          const phoneDiv = document.createElement('div');
          phoneDiv.style.marginBottom = '6px';
          phoneDiv.innerHTML = `<span style="color: #1a73e8;">📞</span> <strong>전화:</strong> ${item.internationalPhoneNumber ? item.internationalPhoneNumber : '<span style="color:#999">정보 없음</span>'}`;
          detailsDiv.appendChild(phoneDiv);
          
          // 평점 (항상 표시)
          const ratingDiv = document.createElement('div');
          ratingDiv.style.marginBottom = '6px';
          ratingDiv.innerHTML = `<span style="color: #1a73e8;">⭐</span> <strong>평점:</strong> ${item.rating ? item.rating : '<span style="color:#999">정보 없음</span>'}`;
          detailsDiv.appendChild(ratingDiv);

          // 영업시간 (항상 표시)
          const hoursText = item.regularOpeningHours?.weekdayDescriptions?.[0] || null;
          const hoursDiv = document.createElement('div');
          hoursDiv.style.marginBottom = '6px';
          hoursDiv.innerHTML = `<span style="color: #1a73e8;">⏰</span> <strong>영업시간:</strong> ${hoursText ? hoursText : '<span style="color:#999">정보 없음</span>'}`;
          detailsDiv.appendChild(hoursDiv);
          
          itemCard.appendChild(detailsDiv);
          itemsContainer.appendChild(itemCard);
        }
        
        dayElement.appendChild(itemsContainer);

        // Day 페이지 생성
        try {
          const dayCanvas = await html2canvas(dayElement, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true,
            allowTaint: true,
            onclone: (clonedDoc) => {
              const clonedElement = clonedDoc.querySelector('div');
              if (clonedElement) {
                clonedElement.style.position = 'static';
                clonedElement.style.left = '0';
              }
            },
            windowWidth: 595, // A4 너비에 맞춤
            width: 595
          });

          // 요소 정리
          document.body.removeChild(dayElement);
          
          const dayImgData = dayCanvas.toDataURL('image/jpeg', 1.0);
          
          // 이미지 크기 계산 (A4 크기에 맞게 조정)
          const imgWidth = contentWidth;
          const imgHeight = (dayCanvas.height * imgWidth) / dayCanvas.width;
          
          // Day 1은 첫 페이지의 헤더 아래에 배치, 나머지는 새 페이지에서 시작
          if (i === 0) {
            // 첫 번째 Day의 내용이 남은 공간에 들어갈 수 있는지 확인
            const remainingHeight = pageHeight - (headerImgHeight + margin * 3);
            if (imgHeight <= remainingHeight) {
              // 헤더 아래에 배치
              doc.addImage(
                dayImgData,
                'JPEG',
                margin,
                margin * 2 + headerImgHeight,
                imgWidth,
                imgHeight,
                undefined,
                'FAST'
              );
            } else {
              // 새 페이지에 시작
              doc.addPage();
              // 새 페이지에서의 분할 필요 여부 처리
              if (imgHeight > contentHeight) {
                // slicing with small margin to avoid overflow
                const mmPerPx = imgWidth / dayCanvas.width;
                const sliceMarginMm = 4; // leave small margin
                const heightPerPageMm = contentHeight - sliceMarginMm;
                const heightPerPagePx = Math.floor(heightPerPageMm / mmPerPx);
                let srcY = 0;
                let pageIndex = 0;

                while (srcY < dayCanvas.height) {
                  if (pageIndex > 0) doc.addPage();

                  const sliceHeightPx = Math.min(heightPerPagePx, dayCanvas.height - srcY);

                  const tmpCanvas = document.createElement('canvas');
                  tmpCanvas.width = dayCanvas.width;
                  tmpCanvas.height = sliceHeightPx;
                  const tctx = tmpCanvas.getContext('2d')!;
                  tctx.fillStyle = '#ffffff';
                  tctx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height);

                  tctx.drawImage(dayCanvas, 0, srcY, dayCanvas.width, sliceHeightPx, 0, 0, tmpCanvas.width, tmpCanvas.height);

                  const sliceData = tmpCanvas.toDataURL('image/jpeg', 1.0);
                  const sliceHeightMm = sliceHeightPx * mmPerPx;

                  doc.addImage(sliceData, 'JPEG', margin, margin, imgWidth, sliceHeightMm, undefined, 'FAST');

                  srcY += sliceHeightPx;
                  pageIndex++;
                }
              } else {
                doc.addImage(
                  dayImgData,
                  'JPEG',
                  margin,
                  margin,
                  imgWidth,
                  imgHeight,
                  undefined,
                  'FAST'
                );
              }
            }
          } else {
            // Day 2 이후는 이미 for-loop 시작부에서 새 페이지를 추가했으므로 여기서는 중복 추가하지 않습니다.
            
            // 이미지가 한 페이지보다 큰 경우 분할 (정확한 픽셀↔mm 변환 사용)
            if (imgHeight > contentHeight) {
              const mmPerPx = imgWidth / dayCanvas.width; // mm per source px
              const heightPerPageMm = contentHeight; // mm
              const heightPerPagePx = Math.floor(heightPerPageMm / mmPerPx); // px
              let srcY = 0;
              let pageIndex = 0;

              while (srcY < dayCanvas.height) {
                if (pageIndex > 0) doc.addPage();

                const sliceHeightPx = Math.min(heightPerPagePx, dayCanvas.height - srcY);

                const tmpCanvas = document.createElement('canvas');
                tmpCanvas.width = dayCanvas.width;
                tmpCanvas.height = sliceHeightPx;
                const tctx = tmpCanvas.getContext('2d')!;
                tctx.fillStyle = '#ffffff';
                tctx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height);

                tctx.drawImage(dayCanvas, 0, srcY, dayCanvas.width, sliceHeightPx, 0, 0, tmpCanvas.width, tmpCanvas.height);

                const sliceData = tmpCanvas.toDataURL('image/jpeg', 1.0);
                const sliceHeightMm = sliceHeightPx * mmPerPx;

                doc.addImage(sliceData, 'JPEG', margin, margin, imgWidth, sliceHeightMm, undefined, 'FAST');

                srcY += sliceHeightPx;
                pageIndex++;
              }
            } else {
              // 한 페이지에 들어가는 경우
              doc.addImage(
                dayImgData,
                'JPEG',
                margin,
                margin,
                imgWidth,
                imgHeight,
                undefined,
                'FAST'
              );
            }
          }
        } catch (err: any) {
          window.console.error('Day 페이지 생성 중 오류:', err);
          throw new Error(`Day ${day.day} 페이지 생성 실패: ${err.message || '알 수 없는 오류'}`);
        }
      }

      const fileName = `${tripResult.tripTitle || '여행일정'}.pdf`;
      doc.save(fileName);
    } catch (error) {
      window.console.error('PDF 생성 중 오류:', error);
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setIsExporting(false);
    }
  };

  async function fetchSavedTrips() {
    const remember = typeof window !== 'undefined' && localStorage.getItem('trip-planner-remember') === '1';
    const token = getStoredToken();
    if (!remember || !token) return; // 자동로그인 미체크면 요청 자체를 생략
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

  useEffect(() => {
    const boot = async () => {
      await ensureFreshToken(); // 선제 갱신으로 401과 콘솔 경고 최소화
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
    };
    boot();
  }, []);
  
  const handleLogout = () => {
    clearStoredToken();
    setCurrentUser(null);
    setSavedTrips([]);
    setTripResult(null);
    setCurrentTripId(null);
  };

  const handleSaveTrip = async () => {
    if (!tripResult || !currentUser) { alert('저장할 여행 일정이 없거나 로그인 상태가 아닙니다.'); return; }
  const token = getStoredToken(); if (!token) { alert('로그인이 필요합니다.'); return; }
    const customTitle = prompt("저장할 여행 일정의 제목을 입력하세요:", tripResult.tripTitle);
    if (!customTitle) return;
    try {
      const response = await authFetch('/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tripTitle: customTitle, destination, period, keywords, daysJson: tripResult.days }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '저장에 실패했습니다.');
      alert('여행 일정이 성공적으로 저장되었습니다!');
      setCurrentTripId(data.trip.id);
      fetchSavedTrips();
    } catch (err: any) { alert(`저장 실패: ${err.message}`); }
  };

  const handleLoadTrip = (trip: SavedTrip) => {
    setDestination(trip.destination);
    setPeriod(trip.period);
    setKeywords(trip.keywords);
    setTripResult({
      tripTitle: trip.tripTitle,
      destination: trip.destination,
      period: trip.period,
      keywords: trip.keywords,
      days: trip.daysJson,
    });
    setCurrentTripId(trip.id);
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setTripResult(null);
    setError(null);
    setAddingPlaceToDayIndex(null);
    setCurrentTripId(null);
    try {
      const response = await fetch('/api/generate-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          period,
          keywords,
          travelType,
          budgetMode,
          include: includeText,
          exclude: excludeText,
          preferredTransport,
          categoryPreferences: catPrefs,
          preferenceLimits: Object.fromEntries(
            Object.entries(preferenceLimits)
              .filter(([,v]) => v !== '' && !Number.isNaN(Number(v)))
              .map(([k,v]) => [k, Number(v)])
          ),
          rotationEnabled
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '알 수 없는 에러가 발생했습니다.');
      setTripResult({ ...data, destination, period, keywords });
    } catch (err: any) { setError(err.message); } finally { setIsLoading(false); }
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

    // 같은 day 내에서 순서 변경이 발생하면 시간을 재할당: 09:00부터 2시간 간격
    const baseHour = 9;
    const interval = 2; // hours
    const reassigned = newItinerary.map((itm, idx) => {
      const hour = baseHour + idx * interval;
      const hh = String(hour % 24).padStart(2, '0');
      const mm = '00';
      return { ...itm, time: `${hh}:${mm}` };
    });

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
      let newTime = "10:00";
      if (targetDay.itinerary.length > 0) {
        const [hours] = targetDay.itinerary.at(-1)!.time.split(':').map(Number);
        newTime = `${String((hours + 2) % 24).padStart(2, '0')}:00`;
      }
      targetDay.itinerary.push({ time: newTime, place: placeDetails.place || '이름 없는 장소', description: '', reason: '', ...placeDetails });
      setTripResult({ ...tripResult, days: newDays });
      setAddingPlaceToDayIndex(null);
    } catch (err: any) { setError(`장소 추가 실패: ${err.message}`); }
  };

  const handleOptimizeRoute = async (dayIndex: number, baseItinerary?: ItineraryItem[]) => {
    if (!tripResult) return;
    if (travelMode === 'TRANSIT') { alert('대중교통 모드는 경로 최적화를 지원하지 않습니다.'); return; }
    setOptimizingDay(dayIndex);
    try {
      const itineraryToOptimize = baseItinerary || tripResult.days[dayIndex].itinerary;
      const response = await fetch('/api/optimize-route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itinerary: itineraryToOptimize, travelMode: travelMode }) });
      const optimizedItinerary = await response.json();
      if (!response.ok) throw new Error(optimizedItinerary.error || '경로 최적화에 실패했습니다.');

      let finalItinerary = optimizedItinerary;
      if (autoReassignAfterOptimize) {
        try {
          const legsResp = await fetch('/api/estimate-durations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itinerary: optimizedItinerary, travelMode }) });
          const legsData = await legsResp.json().catch(() => ({}));
          if (legsResp.ok && Array.isArray(legsData.legs)) {
            finalItinerary = scheduleWithDurations(optimizedItinerary, travelMode as TravelMode);
          }
        } catch {}
      }

      const newDays = [...tripResult.days];
      newDays[dayIndex] = { ...newDays[dayIndex], itinerary: finalItinerary };
      setTripResult({ ...tripResult, days: newDays });
      alert('경로가 성공적으로 최적화되었습니다!');
    } catch (err: any) { setError(err.message); } finally { setOptimizingDay(null); }
  };

  // 근처 대안 불러오기 및 모달 열기
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
      newDays[altDayIndex] = { ...newDays[altDayIndex], itinerary: updatedItinerary };
      setTripResult(prev => ({ ...(prev as TripData), days: newDays }));
      setAltModalOpen(false);
      // 선택 후 자동 최적화 토글이 켜져 있으면 실행
      if (autoOptimizeAfterReplace) {
        await handleOptimizeRoute(altDayIndex, updatedItinerary);
      }
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

  const styles: { [key: string]: React.CSSProperties } = {
    savedTripsContainer: { background: '#f8f9fa', padding: '15px', borderRadius: '8px', margin: '20px 0' },
    savedTripItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #dee2e6', gap: '10px' },
    loadButton: { padding: '5px 10px', fontSize: '12px', background: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
    deleteTripButton: { padding: '5px 8px', fontSize: '12px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: '8px' },
    container: { padding: '20px', fontFamily: "'Pretendard', sans-serif", maxWidth: '800px', margin: 'auto', background: '#fff', color: '#212529' },
    form: { display: 'flex', gap: '10px', marginBottom: '30px' },
    input: { padding: '10px', flex: 1, border: '1px solid #dee2e6', borderRadius: '8px', fontSize: '16px' },
    button: { padding: '10px 15px', background: '#007bff', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' },
    loadingText: { textAlign: 'center', fontSize: '18px', color: '#495057' },
    errorBox: { color: '#721c24', background: '#f8d7da', border: '1px solid #f5c6cb', padding: '15px', borderRadius: '8px', marginTop: '20px' },
    resultContainer: { marginTop: '30px' },
    resultBox: { border: '1px solid #e9ecef', padding: '25px', borderRadius: '12px', background: '#f8f9fa' },
    tripTitle: { textAlign: 'center', marginBottom: '10px', fontSize: '28px', fontWeight: 'bold' },
    totalBudgetText: { textAlign: 'center', fontSize: '20px', fontWeight: 'bold', color: '#28a745', margin: '10px 0 20px 0', border: '1px solid #c3e6cb', background: '#d4edda', padding: '10px', borderRadius: '8px' },
  dayTitleContainer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #007bff', flexWrap: 'wrap', gap: '10px' },
    dayTitle: { paddingBottom: '10px', color: '#007bff', fontSize: '22px', margin: 0 },
    dayTotalText: { fontSize: '16px', color: '#6c757d', fontWeight: 'normal', paddingBottom: '10px' },
  dayStats: { display: 'flex', gap: 10, alignItems: 'center', color: '#495057', fontSize: 14 },
  statBadge: { background: '#eef6ff', border: '1px solid #cfe2ff', color: '#0d6efd', padding: '4px 8px', borderRadius: 12 },
    optimizationContainer: { display: 'flex', gap: '10px', alignItems: 'center', paddingBottom: '10px'},
    travelModeButton: { padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px', background: 'white', cursor: 'pointer', fontSize: '12px' },
    activeTravelMode: { background: '#007bff', color: 'white', border: '1px solid #007bff' },
    optimizeButton: { padding: '6px 12px', background: '#28a745', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
    itineraryList: { listStyle: 'none', paddingLeft: '0' },
    itineraryItem: { position: 'relative', marginBottom: '15px', background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', touchAction: 'none' },
    itemHeader: { margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '20px', display: 'flex', alignItems: 'center' },
    itemTime: { background: '#007bff', color: 'white', padding: '5px 12px', borderRadius: '15px', marginRight: '12px', fontSize: '16px', cursor: 'pointer' },
    placeName: { flex: 1 },
    itemDescription: { margin: '8px 0', color: '#495057', fontSize: '16px', cursor: 'pointer', minHeight: '24px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
    inlineInput: { border: '1px solid #007bff', outline: 'none', background: '#eef6ff', width: '80px', textAlign: 'center' },
    inlineTextarea: { width: '100%', border: '1px solid #007bff', borderRadius: '4px', padding: '8px', fontSize: '16px', minHeight: '60px', resize: 'vertical', outline: 'none', fontFamily: 'inherit' },
    itemReason: { margin: '8px 0', color: '#6c757d', fontStyle: 'italic', background: '#e9ecef', padding: '8px 12px', borderRadius: '8px', fontSize: '15px' },
    detailsContainer: { marginTop: '15px', fontSize: '15px', color: '#343a40', paddingLeft: '10px', borderLeft: '3px solid #007bff' },
    detailItem: { margin: '8px 0', display: 'flex', alignItems: 'center', gap: '8px' },
    detailIcon: { marginRight: '8px', fontSize: '18px' },
    websiteLink: { color: '#007bff', textDecoration: 'none', fontWeight: 'bold' },
    expenseInput: { width: '120px', padding: '4px 8px', border: '1px solid #007bff', borderRadius: '4px', outline: 'none', fontSize: '15px' },
    expenseText: { cursor: 'pointer', color: '#007bff', fontWeight: 'bold', padding: '4px 0', minWidth: '100px' },
  deleteButton: { position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', color: '#adb5bd', fontSize: '24px', cursor: 'pointer', padding: '5px', zIndex: 10 },
  altButton: { position: 'absolute', top: '10px', right: '44px', background: 'transparent', border: '1px solid #adb5bd', color: '#495057', fontSize: '12px', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, zIndex: 10 },
    addPlaceButton: { width: '100%', padding: '10px', marginTop: '10px', border: '2px dashed #007bff', borderRadius: '8px', background: 'rgba(0, 123, 255, 0.05)', color: '#007bff', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold' },
    autocompleteContainer: { position: 'relative', padding: '15px 0', marginTop: '10px' },
    autocompleteInput: { width: '100%', padding: '12px', border: '1px solid #ced4da', borderRadius: '8px', fontSize: '16px' }
  };

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) { return <div>Google Maps API 키를 로드할 수 없습니다. .env.local 파일을 확인해주세요.</div>; }
  
  const getCenterLocation = () => {
    if (tripResult && tripResult.days.length > 0 && tripResult.days[0].itinerary.length > 0) {
      return { lat: tripResult.days[0].itinerary[0].latitude, lng: tripResult.days[0].itinerary[0].longitude };
    }
    return { lat: 37.5665, lng: 126.9780 };
  };

  const grandTotal = tripResult?.days.reduce((total, day) => {
    const dayTotal = day.itinerary.reduce((sum, item) => sum + (item.expense || 0), 0);
    return total + dayTotal;
  }, 0) || 0;

  // 이동 요약 계산 유틸
  const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const estimateDayStats = (day: Day) => {
    let distKm = 0;
    const items = [...day.itinerary].sort((a,b) => (a.time||'').localeCompare(b.time||''));
    for (let i = 1; i < items.length; i++) {
      const a = items[i-1]; const b = items[i];
      if ([a.latitude, a.longitude, b.latitude, b.longitude].every(v => typeof v === 'number' && isFinite(v))) {
        distKm += haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
      }
    }
    const mode = travelMode; // 현 UI의 이동 모드 이용
    const speedKmH = mode === 'WALK' ? 4 : mode === 'DRIVE' ? 28 : 18; // 대략값
    const minutes = Math.round((distKm / Math.max(1e-6, speedKmH)) * 60);
    return { distKm: Math.round(distKm * 10) / 10, minutes };
  };

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}>
      <div style={styles.container}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>AI 여행 플래너 🚀</h1>
          <div style={{ display:'flex', gap: 8, alignItems: 'center' }}>
            <a href="/ljj" style={{ ...styles.button, background:'#0d6efd', textDecoration:'none', display:'inline-block' }}>💬 대화로 만들기</a>
          {currentUser ? (
            <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
              <span style={{fontSize: '14px'}}>환영합니다, {currentUser.nickname}님!</span>
              <button onClick={handleLogout} style={{...styles.button, background: '#6c757d'}}>로그아웃</button>
            </div>
          ) : (
            <button onClick={() => setShowAuthModal(true)} style={{...styles.button, background: '#6c757d'}}>로그인</button>
          )}
          </div>
        </div>

        {currentUser && savedTrips.length > 0 && (
          <div style={styles.savedTripsContainer}>
            <h3 style={{marginTop: 0}}>내 여행 목록 📂</h3>
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
        )}

        <form onSubmit={handleSubmit} style={{ ...styles.form, flexWrap: 'wrap' }}>
          <input type="text" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="여행지" style={{ ...styles.input, minWidth: 160 }} />
          <input type="text" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="기간 (예: 2박 3일)" style={{ ...styles.input, minWidth: 160 }} />
          <input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="키워드 (예: 맛집, 힐링)" style={{ ...styles.input, minWidth: 200 }} />
          <select value={travelType} onChange={(e) => setTravelType(e.target.value as any)} style={{ ...styles.input, minWidth: 140 }}>
            <option value="standard">일반</option>
            <option value="family">가족</option>
            <option value="couple">커플</option>
            <option value="roadtrip">로드트립</option>
            <option value="relaxed">여유</option>
            <option value="intense">빡빡</option>
          </select>
          <select value={budgetMode} onChange={(e) => setBudgetMode(e.target.value as any)} style={{ ...styles.input, minWidth: 140 }}>
            <option value="economy">절약</option>
            <option value="standard">표준</option>
            <option value="premium">프리미엄</option>
          </select>
          <button type="submit" disabled={isLoading} style={styles.button}>{isLoading ? '생성 중...' : '일정 생성!'}</button>
          <input type="text" value={includeText} onChange={(e) => setIncludeText(e.target.value)} placeholder="반드시 포함(쉼표로 구분)" style={{ ...styles.input, width: '100%' }} />
          <input type="text" value={excludeText} onChange={(e) => setExcludeText(e.target.value)} placeholder="제외하고 싶은 것(쉼표)" style={{ ...styles.input, width: '100%' }} />
        </form>

  {/* 고급 옵션 패널 */}
        <div style={{ border: '1px solid #e9ecef', borderRadius: 8, padding: 16, marginBottom: 20, background: '#fbfdff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>고급 옵션</strong>
            <small style={{ color: '#6c757d' }}>영업시간/슬롯/선호도</small>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* 선호 교통 모드 (생성 가이드용) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontWeight: 600 }}>선호 교통 모드</label>
              <select value={preferredTransport} onChange={(e) => setPreferredTransport(e.target.value as any)} style={{ ...styles.input, padding: 8 }}>
                <option value="DRIVE">자동차</option>
                <option value="TRANSIT">대중교통</option>
                <option value="WALK">도보</option>
              </select>
            </div>
            {/* 영업시간 모드 제거: 기본 보수적(완화) 정책 적용 */}

            {/* 로테이션 토글 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontWeight: 600 }}>선호 로테이션</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={rotationEnabled} onChange={(e) => setRotationEnabled(e.target.checked)} />
                다중 선호(쉼표 구분)를 날짜/끼니별로 순환 적용
              </label>
            </div>

            {/* 선호 카테고리 */}
            <div style={{ gridColumn: '1 / span 2', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                { key: 'breakfast', label: '아침 선호(예: 라멘)' },
                { key: 'lunch', label: '점심 선호(예: 스시)' },
                { key: 'dinner', label: '저녁 선호(예: 이자카야)' },
                { key: 'dessert', label: '디저트 선호(예: 케이크)' },
                { key: 'late_night', label: '야식 선호(예: 라멘)' }
              ].map(f => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, color: '#495057' }}>{f.label}</label>
                  <input
                    type="text"
                    value={catPrefs[f.key] || ''}
                    onChange={(e) => setCatPrefs(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder="원하는 카테고리"
                    style={{ ...styles.input, padding: '8px' }}
                  />
                </div>
              ))}
            </div>
            {/* 횟수 제한 */}
            <div style={{ gridColumn: '1 / span 2', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                { key: 'breakfast', label: '아침 선호 최대 횟수' },
                { key: 'lunch', label: '점심 선호 최대 횟수' },
                { key: 'dinner', label: '저녁 선호 최대 횟수' },
                { key: 'dessert', label: '디저트 선호 최대 횟수' },
                { key: 'late_night', label: '야식 선호 최대 횟수' }
              ].map(f => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, color: '#495057' }}>{f.label}</label>
                  <input
                    type="number"
                    min={0}
                    value={preferenceLimits[f.key]}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPreferenceLimits(prev => ({ ...prev, [f.key]: v === '' ? '' : Math.max(0, Number(v)) }));
                    }}
                    placeholder="미설정 시 제한 없음"
                    style={{ ...styles.input, padding: '8px' }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 10, color: '#6c757d', fontSize: 12 }}>
            예시 입력: 라멘, 스시, 이자카야, 카레, 야키니쿠, 카페 등(쉼표로 여러 개 입력 가능). 영문/현지어도 인식합니다.
          </div>
        </div>

        {isLoading && <p style={styles.loadingText}>최고의 일정을 생성하고 있습니다. 잠시만 기다려주세요...</p>}
        {error && <div style={styles.errorBox}><strong>에러:</strong> {error}</div>}

        {tripResult && tripResult.days && tripResult.days.length > 0 && (
          <div style={styles.resultContainer}>
            <div ref={printRef}>
              <div id="itinerary-to-export" style={styles.resultBox}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'}}>
                  <h2 style={{...styles.tripTitle, flexGrow: 1, marginBottom: 0 }}>✨ {tripResult.tripTitle} ✨</h2>
                  <div style={{display: 'flex', gap: '10px'}}>
                    {currentUser && (
                      <>
                        <button onClick={handleShare} style={{...styles.button, background: '#17a2b8' }}> 🔗 공유 </button>
                        <button onClick={() => handleExportPDF()} disabled={isExporting} style={{...styles.button, background: '#ffc107', color: '#212529'}}>
                          {isExporting ? 'PDF 생성 중...' : '📄 PDF'}
                        </button>
                      </>
                    )}
                    {currentUser && (
                      <button onClick={handleSaveTrip} style={{...styles.button, background: '#28a745', height: 'fit-content'}}> 💾 이 일정 저장하기 </button>
                    )}
                  </div>
                </div>
                
                <p style={styles.totalBudgetText}>
                  총 예상 경비: {grandTotal.toLocaleString()}원
                </p>

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  {tripResult.days.map((day, dayIndex) => {
                    const dailyTotal = day.itinerary.reduce((sum, item) => sum + (item.expense || 0), 0);
                    const stats = estimateDayStats(day);
                    return (
                      <div key={day.day}>
                        <div style={styles.dayTitleContainer}>
                          <div style={{display: 'flex', gap: '15px', alignItems: 'baseline'}}>
                              <h3 style={styles.dayTitle}>🗓️ Day {day.day}</h3>
                              <span style={styles.dayTotalText}>
                                <strong>일일 경비:</strong> {dailyTotal.toLocaleString()}원
                              </span>
                              <div style={styles.dayStats}>
                                <span style={styles.statBadge}>🚶/🚗 이동 {stats.distKm} km</span>
                                <span style={styles.statBadge}>⏱️ 약 {stats.minutes}분</span>
                              </div>
                          </div>
                          {day.itinerary.length > 2 && (
                            <div style={styles.optimizationContainer}>
                                <button style={{...styles.travelModeButton, ...(travelMode === 'DRIVE' ? styles.activeTravelMode : {})}} onClick={() => setTravelMode('DRIVE')}>🚗</button>
                                <button style={{...styles.travelModeButton, ...(travelMode === 'TRANSIT' ? styles.activeTravelMode : {})}} onClick={() => setTravelMode('TRANSIT')}>🚌</button>
                                <button style={{...styles.travelModeButton, ...(travelMode === 'WALK' ? styles.activeTravelMode : {})}} onClick={() => setTravelMode('WALK')}>🚶</button>
                                <button style={styles.optimizeButton} onClick={() => handleOptimizeRoute(dayIndex)} disabled={optimizingDay === dayIndex}>
                                  {optimizingDay === dayIndex ? '...' : '최적화'}
                                </button>
                                <label style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color:'#475569' }}>
                                  <input type="checkbox" checked={autoOptimizeAfterReplace} onChange={(e)=>setAutoOptimizeAfterReplace(e.target.checked)} /> 교체 후 자동 최적화
                                </label>
                                <label style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color:'#475569' }}>
                                  <input type="checkbox" checked={autoReassignAfterOptimize} onChange={(e)=>setAutoReassignAfterOptimize(e.target.checked)} /> 최적화 후 시간 재배정
                                </label>
                            </div>
                          )}
                        </div>
                        <SortableContext items={day.itinerary.map(item => item.place + item.time)} strategy={verticalListSortingStrategy}>
                          <ul style={styles.itineraryList}>
                            {day.itinerary.map((item, itemIndex) => (
                              <SortableItem key={`${item.place}-${item.time}`} dayIndex={dayIndex} itemIndex={itemIndex} item={item} handleDeleteItem={handleDeleteItem} handleUpdateItem={handleUpdateItem} styles={styles} onOpenAlternatives={openAlternatives} />
                            ))}
                          </ul>
                        </SortableContext>
                        
                        {addingPlaceToDayIndex === dayIndex ? (
                          <PlaceAutocomplete onPlaceSelect={handlePlaceAdd} styles={styles} centerLocation={getCenterLocation()} />
                        ) : (
                          <button style={styles.addPlaceButton} onClick={() => setAddingPlaceToDayIndex(dayIndex)}>
                            + 장소 추가하기
                          </button>
                        )}
                      </div>
                    );
                  })}
                </DndContext>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', marginBottom: '8px' }}>
              <button onClick={() => setSelectedDay(null)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: selectedDay === null ? '#e9eefb' : '#fff' }}>All</button>
              {tripResult.days.map(d => (
                <button key={d.day} onClick={() => setSelectedDay(d.day)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: selectedDay === d.day ? '#e9eefb' : '#fff' }}>Day {d.day}</button>
              ))}
            </div>
            <TripMap days={tripResult.days} selectedDay={selectedDay} />
          </div>
        )}

        {showShareModal && (
          <ShareModal shareUrl={shareUrl} onClose={() => setShowShareModal(false)} />
        )}

        {showAuthModal && (
          <AuthModal
            onClose={() => setShowAuthModal(false)}
            onLoginSuccess={(token, autoLogin) => {
              const decoded: { userId: string, email: string, nickname: string } = jwtDecode(token);
              setCurrentUser({ id: decoded.userId, email: decoded.email, nickname: decoded.nickname });
              // autoLogin이면 localStorage, 아니면 sessionStorage 에 저장
              if (autoLogin) {
                localStorage.setItem('trip-planner-token', token);
                localStorage.setItem('trip-planner-remember', '1');
                sessionStorage.removeItem('trip-planner-token');
              } else {
                sessionStorage.setItem('trip-planner-token', token);
                localStorage.removeItem('trip-planner-token');
                localStorage.removeItem('trip-planner-remember');
              }
              setShowAuthModal(false);
              fetchSavedTrips();
            }}
          />
        )}

        {/* 근처 대안 모달 */}
        <AlternativesModal
          open={altModalOpen}
          baseItem={altBaseItem}
          list={altList}
          page={altPage}
          total={altTotal}
          filters={altFilters}
          onApplyFilters={async (f) => {
            setAltFilters(f);
            if (altBaseItem) await fetchAlternatives(altBaseItem.latitude!, altBaseItem.longitude!, 1, f);
          }}
          onPage={async (p) => {
            if (altBaseItem) await fetchAlternatives(altBaseItem.latitude!, altBaseItem.longitude!, p, altFilters);
          }}
          onClose={() => setAltModalOpen(false)}
          onSelect={applyAlternative}
        />
      </div>
    </APIProvider>
  );
}