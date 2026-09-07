export function adjacentCapture(ids: string[], selected: string, direction: -1 | 1) {
  const index = ids.indexOf(selected);
  if (index < 0) return null;
  return ids[index + direction] ?? null;
}

export function horizontalWheelDelta(deltaX: number, deltaY: number, mode: number, width: number) {
  const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  return delta * (mode === 1 ? 16 : mode === 2 ? width : 1);
}

export function revealOffset(left: number, right: number, viewportLeft: number, viewportRight: number) {
  if (left < viewportLeft) return left - viewportLeft;
  if (right > viewportRight) return right - viewportRight;
  return 0;
}

export function navigationDirection(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'isComposing' | 'defaultPrevented'>): -1 | 1 | null {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return null;
  return event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : null;
}
