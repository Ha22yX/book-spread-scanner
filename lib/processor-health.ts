export type ProcessorHealth = 'online' | 'offline' | 'unknown';
export const PRESENCE_KEY = '_system/processor-presence.json';
export function processorHealth(lastSeen: number | null, now = Date.now()): ProcessorHealth {
  return lastSeen !== null && now - lastSeen < 90_000 && lastSeen <= now + 5000
    ? 'online' : 'offline';
}
