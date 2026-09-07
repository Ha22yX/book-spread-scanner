'use client';
/* oxlint-disable nextjs/no-img-element -- Authentic scanned pixels are required for coordinate overlays. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Interactive SVG highlights use keyboard button semantics. */
import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { imageUrl } from '@/lib/client';
import type { Spread } from '@/lib/types';
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
  const [layout, setLayout] = useState<{
    width: number;
    height: number;
    notes: Placement[];
  }>({ width: 1, height: 1, notes: [] });
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
        for (const note of spread.annotations ?? []) {
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
            Math.min(bounds.height - height - 24, y - height / 2),
          );
          occupied[side] = top + height + 24;
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
        setLayout({ width: bounds.width, height: bounds.height, notes });
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
  }, [spread]);
  return (
    <div className="marginal-scroll" aria-label="带页边批注的双页书本">
      <div className="marginal-desk" ref={root}>
        <div className="marginal-pages">
          {(['left', 'right'] as const).map((side) => (
            <article className="book-page" key={side}>
              <div className="page-caption">
                <span>{side === 'left' ? '左页' : '右页'}</span>
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
                  aria-label="整句高亮"
                >
                  {spread.annotations?.flatMap((note) =>
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
                            <title>{a.quote}</title>
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
          {layout.notes.map((n) => (
            <g
              key={n.id}
              className={activeNote === n.id ? 'leader-active' : ''}
            >
              <path
                d={`M ${n.x} ${n.y} L ${n.side === 'left' ? n.endX + 14 : n.endX - 14} ${n.y} L ${n.endX} ${n.endY}`}
              />
              <circle cx={n.x} cy={n.y} r={3} />
            </g>
          ))}
        </svg>
        {spread.annotations?.map((note, i) => {
          const place = layout.notes.find((n) => n.id === note.id);
          const side = note.anchors[0]?.side ?? 'right';
          return (
            <button
              id={note.id}
              data-card={note.id}
              key={note.id}
              className={`margin-note margin-${side} ${activeNote === note.id ? 'active' : ''}`}
              style={{ top: place?.top ?? 80 + i * 130 }}
              onClick={() => onNote(note.id)}
              onFocus={() => onNote(note.id)}
              aria-label={`批注 ${i + 1}：${note.comment}`}
            >
              {spread.annotations!.length > 1 && <span className="margin-note-number">
                {String(i + 1).padStart(2, '0')}
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
