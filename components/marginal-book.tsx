'use client';
/* oxlint-disable nextjs/no-img-element -- Authentic scanned pixels are required for coordinate overlays. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Interactive SVG highlights use keyboard button semantics. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { imageUrl } from '@/lib/client';
import type { Spread } from '@/lib/types';
import { quoteGeometry } from '@/lib/highlight-geometry';
import { noteStyle } from '@/lib/note-colors';
type Placement = {
  id: string;
  side: 'left' | 'right';
  top: number;
  x: number;
  y: number;
  endX: number;
  endY: number;
};
export function MarginalBook({
  session,
  spread,
  activeNote,
  onNote,
}: {
  session: string;
  spread: Spread;
  activeNote: string;
  onNote: (id: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const annotations = useMemo(() => (spread.annotations ?? []).map(n=>({...n,anchors:n.anchors.map(a=>{
    const span=spread.spans?.find(s=>s.id===a.span_id);
    const start=a.start ?? span?.text.indexOf(a.quote) ?? -1;
    if(!span || start<0 || (a.start===undefined && span.text.indexOf(a.quote,start+1)>=0))return a;
    return {...a,...quoteGeometry(span,start,a.end ?? start+a.quote.length)};
  })})),[spread]);
  const [layout, setLayout] = useState<{
    width: number;
    height: number;
    notes: Placement[];
    railHeight: number;
  }>({ width: 1, height: 1, notes: [], railHeight:470 });
  useEffect(() => {
    const desk = root.current;
    if (!desk) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = desk.getBoundingClientRect();
        const notes: Placement[] = [];
        const occupied = { left: 45, right: 45 };
        const remaining = {left:0,right:0};
        for(const note of annotations){
          const card=desk.querySelector<HTMLElement>(`[data-card="${CSS.escape(note.id)}"]`);
          remaining[note.anchors[0]?.side ?? 'right']+=(card?.getBoundingClientRect().height ?? 0)+24;
        }
        const railHeight=Math.max(470,remaining.left+90,remaining.right+90);
        for (const note of annotations) {
          const side = note.anchors[0]?.side ?? 'right';
          const marks = [
            ...desk.querySelectorAll<SVGGraphicsElement>(
              `[data-note="${CSS.escape(note.id)}"][data-side="${side}"]`,
            ),
          ];
          const rects = marks
            .map((m) => m.getBoundingClientRect())
            .filter((r) => r.width > 0);
          const mark = rects.sort(
            (a, b) => b.width * b.height - a.width * a.height,
          )[0];
          const card = desk.querySelector<HTMLElement>(
            `[data-card="${CSS.escape(note.id)}"]`,
          );
          if (!mark || !card) continue;
          const height = card.getBoundingClientRect().height;
          const y = mark.top - bounds.top + mark.height / 2;
          const top = Math.max(
            occupied[side],
            Math.min(Math.max(bounds.height,railHeight) - remaining[side] - 24, y - height / 2),
          );
          occupied[side] = top + height + 24;
          remaining[side] -= height + 24;
          notes.push({
            id: note.id,
            side,
            top,
            x: (side === 'left' ? mark.left : mark.right) - bounds.left,
            y,
            endX: bounds.width * (side === 'left' ? 0.172 : 0.828),
            endY: top + height / 2,
          });
        }
        setLayout({ width: bounds.width, height: bounds.height, notes, railHeight });
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(desk);
    desk
      .querySelectorAll('img, .margin-note')
      .forEach((el) => observer.observe(el));
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [annotations]);
  return (
    <div className="marginal-scroll" aria-label="带页边批注的双页书本">
      <div className="marginal-desk" ref={root} style={{minHeight:layout.railHeight}}>
        <div className="marginal-pages">
          {(['left', 'right'] as const).map((side) => (
            <article className="book-page" key={side}>
              <div className="page-caption">
                <span>{side === 'left' ? '左页' : '右页'}{spread.pageNumbers && ` · P${spread.pageNumbers[side] ?? '?'}`}</span>
                <a
                  href={imageUrl(session, spread, side)}
                  download
                  aria-label={`下载${side === 'left' ? '左' : '右'}页`}
                >
                  <Download size={16} />
                </a>
              </div>
              <div className="page-image">
                <img
                  src={imageUrl(session, spread, side)}
                  alt={`${side === 'left' ? '左' : '右'}页分割结果`}
                />
                <svg
                  className="highlight-overlay"
                  viewBox={`0 0 ${spread[side].width} ${spread[side].height}`}
                  aria-label="批注引用短语高亮"
                >
                  {annotations.flatMap((note, ni) =>
                    note.anchors
                      .filter((a) => a.side === side)
                      .flatMap((a, ai) =>
                        (a.polygon
                          ? [a.polygon]
                          : a.boxes.map((b) => [
                              { x: b.x0, y: b.y0 },
                              { x: b.x1, y: b.y0 },
                              { x: b.x1, y: b.y1 },
                              { x: b.x0, y: b.y1 },
                            ])
                        ).map((polygon, bi) => (
                          <polygon
                            key={`${note.id}-${ai}-${bi}`}
                            data-note={note.id}
                            data-side={side}
                            points={polygon
                              .map((p) => `${p.x},${p.y}`)
                              .join(' ')}
                            className={`highlight ${activeNote === note.id ? 'selected' : ''}`}
                            style={noteStyle(ni)}
                            onClick={() => onNote(note.id)}
                            role="button"
                            tabIndex={0}
                            aria-label={`查看批注：${note.comment}`}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onNote(note.id);
                              }
                            }}
                          >
                            <title>{`${a.quote}${a.geometry==='estimated' ? '（根据原有行坐标估算词句边界）' : ''}`}</title>
                          </polygon>
                        )),
                      ),
                  )}
                </svg>
              </div>
            </article>
          ))}
        </div>
        <svg
          className="leader-overlay"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          aria-hidden="true"
        >
          {layout.notes.filter(n=>annotations.some(a=>a.id===n.id)).map((n) => (
            <g
              key={n.id}
              className={activeNote === n.id ? 'leader-active' : ''}
              style={noteStyle(annotations.findIndex(a=>a.id===n.id))}
            >
              <path
                d={`M ${n.x} ${n.y} L ${n.side === 'left' ? n.endX + 14 : n.endX - 14} ${n.y} L ${n.endX} ${n.endY}`}
              />
              <circle cx={n.x} cy={n.y} r={3} />
            </g>
          ))}
        </svg>
        {annotations.map((note, i) => {
          const place = layout.notes.find((n) => n.id === note.id);
          const side = note.anchors[0]?.side ?? 'right';
          return (
            <button
              id={note.id}
              data-card={note.id}
              key={note.id}
              className={`margin-note margin-${side} ${activeNote === note.id ? 'active' : ''}`}
              style={{ ...noteStyle(i), top: place?.top ?? 80 + i * 130 }}
              onClick={() => onNote(note.id)}
              onFocus={() => onNote(note.id)}
              aria-label={`批注 ${i + 1}：${note.comment}`}
            >
              {annotations.length > 1 && <span className="margin-note-number">
                {String(i + 1).padStart(2, '0')}{note.pages?.length ? ` · ${note.pages.map(p=>`P${p}`).join(' / ')}` : ''}
              </span>}
              <span className="margin-note-text" lang="en">
                {note.comment}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
