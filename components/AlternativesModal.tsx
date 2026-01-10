// components/AlternativesModal.tsx
'use client';

import React, { useState } from 'react';
import type { ItineraryItem } from '../types/trip';

export type AltFilters = {
	minRating: number;
	openNow: boolean;
	categories: string[];
};

interface AlternativesModalProps {
	open: boolean;
	baseItem: ItineraryItem | null;
	list: any[];
	page: number;
	total: number;
	filters: AltFilters;
	onApplyFilters: (filters: AltFilters) => void | Promise<void>;
	onPage: (page: number) => void | Promise<void>;
	onClose: () => void;
	onSelect: (candidate: any) => void | Promise<void>;
}

export default function AlternativesModal({ open, baseItem, list, page, total, filters, onApplyFilters, onPage, onClose, onSelect }: AlternativesModalProps) {
	const [localFilters, setLocalFilters] = useState<AltFilters>(filters);

	if (!open) return null;

	const totalPages = Math.max(1, Math.ceil((total || list.length || 0) / 6));

	const styles: { [key: string]: React.CSSProperties } = {
		overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
		modal: { background: '#fff', padding: 20, borderRadius: 8, width: '90%', maxWidth: 720, maxHeight: '80vh', overflow: 'auto', color: '#000' },
		header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, color: '#000' },
		title: { margin: 0, fontSize: 18, fontWeight: 700, color: '#000' },
		closeBtn: { background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer', color: '#333' },
		filters: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
		list: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
		card: { border: '1px solid #e9ecef', borderRadius: 8, padding: 10, background: '#fafafa', color: '#000' },
		actions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
		pager: { display: 'flex', gap: 8, alignItems: 'center' },
		button: { padding: '6px 10px', borderRadius: 6, border: '1px solid #adb5bd', cursor: 'pointer', background: '#fff' },
		primary: { padding: '6px 10px', borderRadius: 6, border: '1px solid #0d6efd', cursor: 'pointer', background: '#0d6efd', color: '#fff' },
		input: { padding: 6, borderRadius: 6, border: '1px solid #ced4da' },
	};

	return (
		<div style={styles.overlay} onClick={onClose}>
			<div style={styles.modal} onClick={(e) => e.stopPropagation()}>
				<div style={styles.header}>
					<h3 style={styles.title}>대안 선택</h3>
					<button style={styles.closeBtn} aria-label="close" onClick={onClose}>&times;</button>
				</div>

				{baseItem && (
					<p style={{ marginTop: 0, color: '#495057' }}>
						기준 장소: <strong>{baseItem.place}</strong>
					</p>
				)}

				<div style={styles.filters}>
					<label>
						최소 평점
						<input
							type="number"
							min={0}
							max={5}
							step={0.1}
							value={localFilters.minRating}
							onChange={(e) => setLocalFilters({ ...localFilters, minRating: parseFloat(e.target.value) || 0 })}
							style={{ ...styles.input, width: 80, marginLeft: 6 }}
						/>
					</label>
					<label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
						<input
							type="checkbox"
							checked={localFilters.openNow}
							onChange={(e) => setLocalFilters({ ...localFilters, openNow: e.target.checked })}
						/>
						지금 영업중
					</label>
					<button style={styles.primary} onClick={() => onApplyFilters(localFilters)}>필터 적용</button>
				</div>

				<div style={styles.list}>
					{list.map((c, idx) => (
						<div key={idx} style={styles.card}>
							<div style={{ fontWeight: 600, marginBottom: 6 }}>{c.place || c.name || '이름 없음'}</div>
							<div style={{ fontSize: 13, color: '#495057' }}>
								{c.formattedAddress || c.address || ''}
							</div>
							<div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
								<span style={{ fontSize: 13 }}>⭐ {c.rating ?? '-'}</span>
								<button style={styles.button} onClick={() => onSelect(c)}>선택</button>
							</div>
						</div>
					))}
					{list.length === 0 && (
						<div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#6c757d' }}>검색된 대안이 없습니다.</div>
					)}
				</div>

				<div style={styles.actions}>
					<div />
					<div style={styles.pager}>
						<button style={styles.button} disabled={page <= 1} onClick={() => onPage(page - 1)}>이전</button>
						<span style={{ fontSize: 13 }}>페이지 {page} / {totalPages}</span>
						<button style={styles.button} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>다음</button>
					</div>
				</div>
			</div>
		</div>
	);
}

