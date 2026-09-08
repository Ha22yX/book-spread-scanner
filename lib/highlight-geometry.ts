import type { Box, Polygon, TextSpan } from './types';

// Relative serif glyph advances. Old line OCR has no measured character boxes:
// this is an explicit estimate, never a claim of character-level OCR accuracy.
export function textAdvance(text: string): number {
  return Array.from(text).reduce((sum, c) => sum + (
    /\s/.test(c) ? 0.25 : /[ilI.,'’!:;|]/.test(c) ? 0.28 : /[mwMW@%]/.test(c) ? 0.85 :
    /[frt()[\]]/.test(c) ? 0.34 : /[A-Z]/.test(c) ? 0.67 : /[\u2e80-\uffff]/.test(c) ? 1 : 0.5
  ), 0);
}
export function clipPolygon(p: Polygon, start: number, end: number): Polygon {
  const lerp = (a: {x:number;y:number}, b: {x:number;y:number}, t:number) => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  return [lerp(p[0],p[1],start),lerp(p[0],p[1],end),lerp(p[3],p[2],end),lerp(p[3],p[2],start)];
}
const bounds = (p: Polygon): Box => ({x0:Math.min(...p.map(v=>v.x)),y0:Math.min(...p.map(v=>v.y)),x1:Math.max(...p.map(v=>v.x)),y1:Math.max(...p.map(v=>v.y))});
export function quoteGeometry(span: TextSpan, start: number, end: number) {
  const words = span.words.filter(w=>w.end>start && w.start<end);
  if (!words.length) throw new Error('引用没有文字坐标');
  const lineOnly = words.length === 1 && words[0].start === 0 && words[0].end === span.text.length;
  const polygons = words.map(w => {
    const {x0,y0,x1,y1}=w.box;
    const p = lineOnly && span.polygon?.length === 4 ? span.polygon : [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
    const total=textAdvance(w.text) || 1;
    return clipPolygon(p, textAdvance(w.text.slice(0,Math.max(0,start-w.start)))/total,
      textAdvance(w.text.slice(0,Math.min(w.text.length,end-w.start)))/total);
  });
  return { boxes:polygons.map(bounds), polygon:polygons.length===1?polygons[0]:undefined,
    geometry: lineOnly && (start>0 || end<span.text.length) ? 'estimated' as const : 'ocr' as const };
}
