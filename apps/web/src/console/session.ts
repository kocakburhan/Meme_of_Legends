/**
 * Konsolun bildiği oturum kimliği: panelde lobi açılırken hatırlanır.
 * Sunucu HTTP yüzeyinde "oda koduna göre oturum" ucu bulunmadığından iptal
 * işlemi bu kimliğe bağlıdır (bkz. görev özeti — açık soru).
 */

const KEY = 'mol:business:session';

interface StoredSession {
  sessionId: string;
  roomCode: string;
}

const parse = (value: unknown): StoredSession | null => {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  return typeof v.sessionId === 'string' && typeof v.roomCode === 'string'
    ? { sessionId: v.sessionId, roomCode: v.roomCode }
    : null;
};

export function rememberSession(sessionId: string, roomCode: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ sessionId, roomCode }));
  } catch {
    /* Storage unavailable; cancel falls back to the panel note. */
  }
}

export function storedSessionFor(roomCode: string): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const stored = parse(JSON.parse(raw));
    return stored && stored.roomCode === roomCode ? stored.sessionId : null;
  } catch {
    return null;
  }
}
