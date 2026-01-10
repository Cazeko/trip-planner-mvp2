import React, { useEffect, useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Day, ItineraryItem } from '../types/trip';
import PlaceAutocomplete from './PlaceAutocomplete';
import { styles } from '../lib/uiStyles';
import { sanitizeText } from '../lib/text';

export type DayColumnProps = {
  day: Day;
  dayIndex: number;
  budget: number;
  optimizing: boolean;
  onOptimizeRoute: (dayIndex: number) => void;
  onDeleteItem: (dayIndex: number, itemIndex: number) => void;
  onUpdateItem: (dayIndex: number, itemIndex: number, field: 'time' | 'description' | 'expense', value: string | number) => void;
  onOpenAlternatives: (dayIndex: number, itemIndex: number, item: ItineraryItem) => void;
  addingPlaceToDayIndex: number | null;
  onAddPlaceClick: (dayIndex: number | null) => void;
  onPlaceSelect: (placeId: string) => void;
  centerLocation: { lat: number; lng: number };
};

const DayColumn: React.FC<DayColumnProps> = ({
  day,
  dayIndex,
  budget,
  optimizing,
  onOptimizeRoute,
  onDeleteItem,
  onUpdateItem,
  onOpenAlternatives,
  addingPlaceToDayIndex,
  onAddPlaceClick,
  onPlaceSelect,
  centerLocation,
}) => {
  return (
    <div style={styles.dayContainer}>
      <div style={styles.dayHeaderRow}>
        <div style={styles.dayTitleGroup}>
          <h3 style={styles.dayTitle}>Day {day.day}</h3>
          <span style={styles.dayBudget}>예상 {budget.toLocaleString()}원</span>
        </div>
        <div style={styles.dayActions}>
          <button
            style={styles.outlineBtn}
            onClick={() => onOptimizeRoute(dayIndex)}
            disabled={optimizing}
          >
            {optimizing ? '최적화 중...' : '경로 최적화'}
          </button>
        </div>
      </div>
      <SortableContext items={day.itinerary.map(item => item.place + item.time)} strategy={verticalListSortingStrategy}>
        <ul style={styles.itineraryList}>
          {day.itinerary.map((item, itemIndex) => (
            <SortableItem
              key={`${item.place}-${item.time}-${itemIndex}`}
              dayIndex={dayIndex}
              itemIndex={itemIndex}
              item={item}
              onDeleteItem={onDeleteItem}
              onUpdateItem={onUpdateItem}
              onOpenAlternatives={onOpenAlternatives}
            />
          ))}
        </ul>
      </SortableContext>
      {addingPlaceToDayIndex === dayIndex ? (
        <PlaceAutocomplete onPlaceSelect={onPlaceSelect} styles={{}} centerLocation={centerLocation} />
      ) : (
        <button style={styles.addPlaceButton} onClick={() => onAddPlaceClick(dayIndex)}>
          + 장소 추가
        </button>
      )}
    </div>
  );
};

const SortableItem = ({
  dayIndex,
  itemIndex,
  item,
  onDeleteItem,
  onUpdateItem,
  onOpenAlternatives,
}: {
  dayIndex: number;
  itemIndex: number;
  item: ItineraryItem;
  onDeleteItem: (dayIndex: number, itemIndex: number) => void;
  onUpdateItem: DayColumnProps['onUpdateItem'];
  onOpenAlternatives: DayColumnProps['onOpenAlternatives'];
}) => {
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
    onUpdateItem(dayIndex, itemIndex, field, valueToSave);
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
        <div {...listeners} style={{ ...styles.dragHandle, marginRight: '8px', cursor: 'grab' }}>⠿</div>
        {isEditing.time ? (
          <input
            type="time"
            value={editedContent.time}
            onChange={(e) => handleInputChange(e, 'time')}
            onBlur={() => handleSave('time')}
            onKeyDown={(e) => handleKeyDown(e, 'time')}
            autoFocus
            style={{ ...styles.itemTime, ...styles.inlineInput }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            style={styles.itemTime}
            onClick={() => setIsEditing({ ...isEditing, time: true })}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {item.time}
          </span>
        )}
        <span style={styles.placeName}>{item.place}</span>
      </div>
      {isEditing.description ? (
        <textarea
          value={editedContent.description}
          onChange={(e) => handleInputChange(e, 'description')}
          onBlur={() => handleSave('description')}
          onKeyDown={(e) => handleKeyDown(e, 'description')}
          autoFocus
          style={{ ...styles.itemDescription, ...styles.inlineTextarea }}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <p
          style={styles.itemDescription}
          onClick={() => setIsEditing({ ...isEditing, description: true })}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {sanitizeText(item.description) || '클릭하여 설명을 추가하세요...'}
        </p>
      )}
      {item.reason && <p style={styles.itemReason}>👍 추천 이유: {sanitizeText(item.reason)}</p>}
      <div style={styles.detailsContainer}>
        <div style={styles.detailItem}>
          <span style={styles.detailIcon}>💰</span> <strong>예상 경비:</strong>
          {isEditing.expense ? (
            <input
              type="number"
              value={editedContent.expense}
              onChange={(e) => handleInputChange(e, 'expense')}
              onBlur={() => handleSave('expense')}
              onKeyDown={(e) => handleKeyDown(e, 'expense')}
              autoFocus
              style={styles.expenseInput}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="0"
            />
          ) : (
            <span
              onClick={() => setIsEditing({ ...isEditing, expense: true })}
              onPointerDown={(e) => e.stopPropagation()}
              style={styles.expenseText}
            >
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
        <button
          style={styles.actionButton}
          onClick={() => onOpenAlternatives(dayIndex, itemIndex, item)}
        >
          대안
        </button>
        <button style={styles.deleteButton} onClick={() => onDeleteItem(dayIndex, itemIndex)}>&times;</button>
      </div>
    </div>
  );
};

export default DayColumn;
