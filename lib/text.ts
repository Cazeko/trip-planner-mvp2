export const sanitizeText = (t?: string) => {
  if (!t) return '';
  let s = t.trim();
  s = s.replace(/[\u0000-\u001F\u007F]/g, '');
  s = s.replace(/[\u0100-\u036F]{3,}/g, '');
  s = s.replace(/\s{3,}/g, ' ');
  if (s.length > 260) s = s.slice(0, 260) + '…';
  return s;
};
