import type { Spread } from './types';

// Project large OCR/geometry out in D1, before rows reach the Worker.
export const SUMMARY_SQL = `SELECT json_remove(data,'$.spans','$.annotations') AS data,
  status,revision,length(data) AS contentBytes FROM spreads
  WHERE session_id=? AND status!='deleted' ORDER BY sequence`;
export function spreadVersion(s: Spread) {
  return `${s.id}:${s.revision}:${s.status}:${s.pipeline?.updatedAt ?? 0}:${s.contentBytes ?? 0}`;
}
export function summarizeSpread(s: Spread): Spread {
  const { spans: _spans, annotations: _annotations, ...summary } = s;
  return summary;
}
export class DetailCache {
  private values = new Map<string, Spread>();
  constructor(private limit = 3) {}
  get(key: string) {
    const value = this.values.get(key);
    if (value) { this.values.delete(key); this.values.set(key, value); }
    return value;
  }
  set(key: string, value: Spread) {
    this.values.delete(key);
    this.values.set(key, value);
    while (this.values.size > this.limit) this.values.delete(this.values.keys().next().value!);
  }
  clear() { this.values.clear(); }
}
