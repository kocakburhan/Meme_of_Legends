/**
 * Tarayıcı kimliği saklama (SPEC 5.5): her tarayıcıya tek katılımcı kimliği.
 * Token'lar imzalı ve oda kapsamlıdır; aynı tarayıcı yenilemede aynı kimlikle
 * döner. Anahtarlar oda kodu başınadır; ekran kimliği ayrı tutulur.
 */

export interface StoredParticipant {
  participantId: string;
  nickname: string;
  role: 'player' | 'voter';
  /** Geç katılım kuralı: bu turdan itibaren puanlayabilir (SPEC 5.6). */
  votingFromRound: number;
  token: string;
}

export interface StoredDisplay {
  token: string;
  roomCode: string;
}

const read = <T>(key: string, parse: (value: unknown) => T | null): T | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return parse(JSON.parse(raw));
  } catch {
    return null;
  }
};

const write = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage unavailable; identity simply does not persist. */
  }
};

const remove = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Ignore. */
  }
};

const participant = (code: string) => `mol:participant:${code}`;

const participantShape = (value: unknown): StoredParticipant | null => {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  return typeof v.participantId === 'string' &&
    typeof v.nickname === 'string' &&
    (v.role === 'player' || v.role === 'voter') &&
    typeof v.votingFromRound === 'number' &&
    typeof v.token === 'string'
    ? { participantId: v.participantId, nickname: v.nickname, role: v.role, votingFromRound: v.votingFromRound, token: v.token }
    : null;
};

export function loadParticipant(code: string): StoredParticipant | null {
  return read(participant(code), participantShape);
}

export function saveParticipant(code: string, value: StoredParticipant): void {
  write(participant(code), value);
}

export function forgetParticipant(code: string): void {
  remove(participant(code));
}

const DISPLAY_KEY = 'mol:display';

export function loadDisplay(): StoredDisplay | null {
  return read(DISPLAY_KEY, (value) => {
    if (typeof value !== 'object' || value === null) return null;
    const v = value as Record<string, unknown>;
    return typeof v.token === 'string' && typeof v.roomCode === 'string'
      ? { token: v.token, roomCode: v.roomCode }
      : null;
  });
}

export function saveDisplay(value: StoredDisplay): void {
  write(DISPLAY_KEY, value);
}

export function forgetDisplay(): void {
  remove(DISPLAY_KEY);
}

/** Ses tercihi (SPEC 13.2): oturum boyunca hatırlanır. */
export function loadSoundOn(): boolean {
  try {
    return localStorage.getItem('mol:sound') === 'on';
  } catch {
    return false;
  }
}

export function saveSoundOn(on: boolean): void {
  try {
    localStorage.setItem('mol:sound', on ? 'on' : 'off');
  } catch {
    /* Ignore. */
  }
}
