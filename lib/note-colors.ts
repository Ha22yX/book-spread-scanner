import type { CSSProperties } from 'react';
export const NOTE_COLORS = [
  {ink:'#916013',fill:'#f5c542',paper:'#fff6d6'},
  {ink:'#236ab1',fill:'#64b5f6',paper:'#eaf4ff'},
  {ink:'#a63b6b',fill:'#ed8fb9',paper:'#fff0f6'},
  {ink:'#347d50',fill:'#7fcf98',paper:'#eafaef'},
] as const;
export function noteStyle(index: number): CSSProperties {
  const c=NOTE_COLORS[Number.isInteger(index) && index>=0 ? index % NOTE_COLORS.length : 0];
  return {'--note-ink':c.ink,'--note-fill':c.fill,'--note-paper':c.paper} as CSSProperties;
}
