'use client';
/* oxlint-disable nextjs/no-img-element -- authenticated, small thumbnail blob */
import { memo, useEffect, useRef, useState } from 'react';

// Limit legacy thumbnail backfills to two simultaneous image decodes in the Worker.
let active = 0;
const waiting: (() => void)[] = [];
async function load(url: string, signal: AbortSignal) {
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    signal.throwIfAborted();
    const response = await fetch(url, {signal, cache: 'default'});
    if (!response.ok) throw new Error('thumbnail unavailable');
    return await response.blob();
  } finally { const next = waiting.shift(); if (next) next(); else active--; }
}

export const LazyThumbnail = memo(function LazyThumbnail({session, id}: {session:string; id:string}) {
  const element = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false);
  const [url, setUrl] = useState('');
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root: node.closest('.filmstrip'), rootMargin:'180px',
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!near) return;
    const controller = new AbortController();
    let objectUrl = '';
    void load(`/api/sessions/${session}/spreads/${id}/image/thumbnail`, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }).catch(() => {});
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); setUrl(''); };
  }, [near, session, id]);
  return <span ref={element} className="film-thumbnail" aria-hidden="true">
    {near && url ? <img src={url} alt="" width={70} height={50} decoding="async" /> : <span className="thumbnail-placeholder" />}
  </span>;
});
