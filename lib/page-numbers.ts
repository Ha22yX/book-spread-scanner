import { z } from 'zod';
import type { Annotation, PageNumbers, Spread } from './types';
const folio = z.string().regex(/^(?:\d{1,5}|[ivxlcdmIVXLCDM]{1,12})$/).nullable();
export const pageNumbersSchema = z.object({left:folio,right:folio});
export function attachPageNumbers(notes: Annotation[], pages: PageNumbers): Annotation[] {
  return notes.map(n=>({...n,pages:[...new Set(n.anchors.map(a=>pages[a.side]).filter((p):p is string=>p!==null))],
    anchors:n.anchors.map(a=>({...a,pageNumber:pages[a.side]}))}));
}
export function pageLabel(spread: Pick<Spread,'pageNumbers'|'sequence'>) {
  if(!spread.pageNumbers) return `拍摄 ${spread.sequence}`;
  return `P${spread.pageNumbers.left ?? '?'} - P${spread.pageNumbers.right ?? '?'}`;
}
