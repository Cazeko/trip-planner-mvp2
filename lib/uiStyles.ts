import type { CSSProperties } from 'react';

const SCALE = 1.0;

const scaleValue = (value: string | number): string => {
  if (typeof value === 'number') return `${value * SCALE}px`;
  if (typeof value === 'string') {
    const match = value.match(/^(\d+(?:\.\d+)?)(px|rem|em)$/);
    if (match) {
      const [, num, unit] = match;
      return `${parseFloat(num) * SCALE}${unit}`;
    }
  }
  return value.toString();
};

const sizeProps = [
  'fontSize', 'padding', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'gap', 'borderRadius',
  'width', 'height', 'maxWidth', 'maxHeight', 'minWidth', 'minHeight', 'top', 'right', 'bottom', 'left'
];

const scaleStyles = (styles: CSSProperties): CSSProperties => {
  const scaled: CSSProperties = {};
  Object.entries(styles).forEach(([key, value]) => {
    if (sizeProps.includes(key) && (typeof value === 'string' || typeof value === 'number')) {
      scaled[key as keyof CSSProperties] = scaleValue(value as string | number) as any;
    } else {
      scaled[key as keyof CSSProperties] = value as any;
    }
  });
  return scaled;
};

const rawStyles: Record<string, CSSProperties> = {
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
  },
  expenseText: {
    cursor: 'pointer',
    borderBottom: '1px dashed #ced4da',
    paddingBottom: '1px',
  },
  itemActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '10px',
  },
  actionButton: {
    background: '#e7f1ff',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: '12px',
    color: '#0d6efd',
  },
  deleteButton: {
    background: '#ffe5e5',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 10px',
    cursor: 'pointer',
    color: '#c92a2a',
    fontWeight: 700,
  },
  addPlaceButton: {
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    border: '1px dashed #0d6efd',
    background: '#f8fbff',
    color: '#0d6efd',
    fontWeight: 600,
    cursor: 'pointer',
  },
  expensesRow: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  },
  mapInfo: {
    fontSize: '12px',
    color: '#6c757d',
    marginBottom: '8px',
  }
};

export const styles = Object.fromEntries(
  Object.entries(rawStyles).map(([key, value]) => [key, scaleStyles(value)])
) as Record<string, CSSProperties>;
