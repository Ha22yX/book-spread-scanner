// GET If-None-Match uses weak comparison: a proxy may add W/ after gzip compression.
export function etagMatches(header: string | null, etag: string) {
  if (!header) return false;
  const normalize = (value: string) => value.trim().replace(/^W\//, '');
  return header.split(',').some((value) => value.trim() === '*' || normalize(value) === normalize(etag));
}
