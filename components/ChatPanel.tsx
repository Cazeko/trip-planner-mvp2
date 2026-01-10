import React from 'react';
import type { RefObject } from 'react';
import { styles } from '../lib/uiStyles';
import type { ChatMsg, SavedTrip, User } from '../types/app';

export type ChatPanelProps = {
  currentUser: User | null;
  onLoginClick: () => void;
  onLogout: () => void;
  savedTrips: SavedTrip[];
  onLoadTrip: (trip: SavedTrip) => void;
  onDeleteTrip: (tripId: string) => void;
  msgs: ChatMsg[];
  typing: boolean;
  chatEndRef: RefObject<HTMLDivElement | null>;
  busy: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  chatInputRef: RefObject<HTMLInputElement | null>;
};

const ChatPanel: React.FC<ChatPanelProps> = ({
  currentUser,
  onLoginClick,
  onLogout,
  savedTrips,
  onLoadTrip,
  onDeleteTrip,
  msgs,
  typing,
  chatEndRef,
  busy,
  input,
  onInputChange,
  onSubmit,
  chatInputRef,
}) => {
  return (
    <div style={styles.chatColumn}>
      <div style={styles.chatHeader}>
        <h1 style={styles.chatTitle}>Tripdom</h1>
        <div style={styles.authContainer}>
          {currentUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#000000' }}>안녕하세요! {currentUser.nickname}님</span>
              <button onClick={onLogout} style={styles.authButton}>로그아웃</button>
            </div>
          ) : (
            <button onClick={onLoginClick} style={styles.authButton}>로그인</button>
          )}
        </div>
      </div>

      <div style={styles.chatMessagesContainer}>
        {msgs.map((m, i) => (
          <div key={i} style={{
            ...styles.messageBubble,
            ...(m.role === 'user' ? styles.userBubble : styles.assistantBubble)
          }}>
            {m.content}
          </div>
        ))}
        {typing && (
          <div style={{ ...styles.messageBubble, ...styles.assistantBubble }}>...</div>
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
                    <button style={styles.loadButton} onClick={() => onLoadTrip(trip)}>불러오기</button>
                    <button style={styles.deleteTripButton} onClick={() => onDeleteTrip(trip.id)}>삭제</button>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      <form onSubmit={onSubmit} style={styles.chatInputForm}>
        <input
          ref={chatInputRef}
          value={input}
          onChange={e => onInputChange(e.target.value)}
          placeholder={busy ? '응답을 기다리는 중...' : '여행 계획을 말씀해주세요.'}
          style={styles.chatInput}
          disabled={busy}
          autoFocus
        />
        <button type="submit" disabled={busy} style={styles.sendButton}>전송</button>
      </form>
    </div>
  );
};

export default ChatPanel;
