import type { SessionConfig, Submission, SubmissionView, View } from '@mol/engine';
import type { LibraryMeme, Me, RoomInfo } from './contracts';

/**
 * M3a sahte verileri: ağ olmadan tüm ekranları göstermek için `View` tipine
 * tam uyumlu örnekler. M3b'de gerçek projeksiyon (engine `project`) bunların
 * yerini alacak; fabrikalar saat bilgisini dışarıdan alır.
 */

export const ME_ID = 'p1';

const CONFIG_ELIMINATION = {
  mode: 'elimination' as const,
  leagueRounds: 10,
  selectionSeconds: 60,
  reviewSeconds: 45,
  customContent: true,
  playerApproval: false,
  voterApproval: false,
  acceptVoters: true,
};

const CONFIG_HYBRID = { ...CONFIG_ELIMINATION, mode: 'hybrid' as const };

const CONFIG_LEAGUE = { ...CONFIG_ELIMINATION, mode: 'league' as const, leagueRounds: 10 };

function participants(readyCount: number): View['participants'] {
  const players = [
    { id: 'p1', nickname: 'Ben', role: 'player' as const },
    { id: 'p2', nickname: 'Ali', role: 'player' as const },
    { id: 'p3', nickname: 'Ayşe', role: 'player' as const },
    { id: 'p4', nickname: 'Mehmet', role: 'player' as const },
    { id: 'p5', nickname: 'Zeynep', role: 'player' as const },
    { id: 'p6', nickname: 'Can', role: 'player' as const },
    { id: 'p7', nickname: 'Elif', role: 'player' as const },
  ];
  return players.map((p, index) => ({ ...p, ready: index < readyCount }));
}

function baseView(status: View['status'], phase: View['phase'], config: SessionConfig): View {
  return {
    status,
    phase,
    config,
    participants: [],
    spectatorCount: 4,
    prompt: null,
    matches: [],
    byes: [],
    submissions: [],
    result: null,
    stage: { context: 'elimination', round: 3 },
    table: [],
    completedRounds: [],
    ownSubmission: null,
  };
}

const PROMPTS = {
  salary: { id: 'pr1', text: 'Maaşın yattığı an', owner: 'platform' },
  monday: { id: 'pr2', text: 'Pazartesi sabahı uyanmak', owner: 'platform' },
};

export function fakeRoom(): RoomInfo {
  return { code: 'KA7FT2', businessName: 'Anka Kafe', shareUrl: 'https://mol.gg/o/KA7FT2' };
}

export function fakeMe(role: 'player' | 'voter'): Me {
  return { id: ME_ID, nickname: 'Ben', role, votingFromRound: 1 };
}

export function fakeLibrary(): LibraryMeme[] {
  return [
    { memeId: 'm1', title: 'Maaş yattı ama kira da yattı', category: 'İş', mediaType: 'image' },
    { memeId: 'm2', title: 'Pazartesi yüzü', category: 'Genel', mediaType: 'image' },
    { memeId: 'm3', title: 'Toplantı bitmeyen adam', category: 'İş', mediaType: 'gif' },
    { memeId: 'm4', title: 'Kahve soğudu kahramanı', category: 'Genel', mediaType: 'image' },
    { memeId: 'm5', title: 'Futbol taraftarı heyecanı', category: 'Spor', mediaType: 'gif' },
    { memeId: 'm6', title: 'Sınavdan çıkan öğrenci', category: 'Okul', mediaType: 'image' },
    { memeId: 'm7', title: 'Şampiyonluk kutlaması', category: 'Spor', mediaType: 'video' },
    { memeId: 'm8', title: 'Kediler kurulsun', category: 'Genel', mediaType: 'image' },
    { memeId: 'm9', title: 'Efsane replay', category: 'Spor', mediaType: 'video' },
    { memeId: 'm10', title: 'Diploma gülümsemesi', category: 'Okul', mediaType: 'image' },
  ];
}

export function fakeCategories(): string[] {
  return ['İş', 'Okul', 'Genel', 'Spor'];
}

/* ---------------------------------- 1-2 ---------------------------------- */

export function fakeLobbyView(): View {
  const v = baseView('lobby', { kind: 'lobby' }, CONFIG_HYBRID);
  v.participants = participants(0).map((p) => ({ ...p, ready: false }));
  v.stage = { context: 'league', round: 0 };
  return v;
}

/* ----------------------------------- 3 ----------------------------------- */

export function fakeSelectionPlayerView(now: number, ownSubmission: Submission | null = null): View {
  const v = baseView('running', {
    kind: 'selection',
    roundNo: 3,
    endsAt: now + 42_000,
    promptReplaceUntil: now + 15_000,
  }, CONFIG_ELIMINATION);
  v.prompt = PROMPTS.salary;
  v.participants = participants(5);
  v.matches = [
    ['p1', 'p3'],
    ['p2', 'p5'],
    ['p4', 'p7'],
  ];
  v.byes = ['p6'];
  v.ownSubmission = ownSubmission;
  return v;
}

/* ----------------------------------- 4 ----------------------------------- */

export function fakeSpectatorSelectionView(now: number): View {
  const v = baseView('running', {
    kind: 'selection',
    roundNo: 3,
    endsAt: now + 27_000,
    promptReplaceUntil: now + 5_000,
  }, CONFIG_ELIMINATION);
  v.prompt = PROMPTS.salary;
  v.participants = participants(5);
  v.matches = [
    ['p1', 'p3'],
    ['p2', 'p5'],
    ['p4', 'p7'],
  ];
  v.byes = ['p6'];
  return v;
}

/* ----------------------------------- 5 ----------------------------------- */

export function fakePresentationView(
  now: number,
  variant: 'image' | 'gif' | 'video' | 'youtube' | 'locked-own' | 'locked-rival' | 'last-call' | 'hidden',
): View {
  const inLastCall = variant === 'last-call';
  const phase: View['phase'] = {
    kind: 'presentation',
    roundNo: 3,
    index: 2,
    lastCallAt: now + (inLastCall ? -1_000 : 9_000),
    endsAt: now + (inLastCall ? 4_000 : 12_000),
  };
  const v = baseView('running', phase, CONFIG_ELIMINATION);
  v.prompt = PROMPTS.salary;
  v.participants = participants(7);
  v.matches = [['p1', 'p3']];
  const media = (() => {
    switch (variant) {
      case 'gif':
        return { source: 'system', memeId: 'm3', mediaType: 'gif' } as const;
      case 'video':
        return { source: 'system', memeId: 'm7', mediaType: 'video', durationMs: 15_000 } as const;
      case 'youtube':
        return { source: 'youtube', videoId: 'dQw4w9WgXcQ', startMs: 0, endMs: 15_000 } as const;
      case 'hidden':
        return null;
      default:
        return { source: 'system', memeId: 'm2', mediaType: 'image' } as const;
    }
  })();
  v.submissions = [
    {
      id: 's4',
      media,
      hidden: variant === 'hidden',
      canRate: variant !== 'locked-own' && variant !== 'locked-rival' && variant !== 'hidden',
      ownScore: undefined,
      ratingProgress: { received: 14, eligible: 30 },
    },
  ];
  return v;
}

/* ----------------------------------- 6 ----------------------------------- */

export function fakeReviewView(now: number): View {
  const v = baseView('running', {
    kind: 'review',
    roundNo: 3,
    endsAt: now + 30_000,
  }, CONFIG_ELIMINATION);
  v.prompt = PROMPTS.salary;
  v.participants = participants(7);
  v.matches = [['p1', 'p3']];
  v.byes = ['p6'];
  v.submissions = [
    { id: 's2', media: { source: 'system', memeId: 'm1', mediaType: 'image' }, hidden: false, canRate: true, ownScore: undefined, ratingProgress: { received: 26, eligible: 30 } },
    { id: 's4', media: { source: 'system', memeId: 'm2', mediaType: 'image' }, hidden: false, canRate: false, ownScore: 4, ratingProgress: { received: 30, eligible: 30 } },
    { id: 's5', media: { source: 'system', memeId: 'm3', mediaType: 'gif' }, hidden: false, canRate: true, ownScore: 2, ratingProgress: { received: 28, eligible: 30 } },
    { id: 's7', media: null, hidden: true, canRate: false, ownScore: undefined, ratingProgress: { received: 21, eligible: 30 } },
  ];
  return v;
}

/* ----------------------------------- 7 ----------------------------------- */

export function fakeRevealView(now: number, step: number): View {
  const v = baseView('running', {
    kind: 'reveal',
    roundNo: 3,
    step,
    nextStepAt: now + 1_500,
  }, CONFIG_ELIMINATION);
  v.prompt = PROMPTS.salary;
  v.participants = participants(7);
  v.matches = [
    ['p2', 'p5'],
    ['p4', 'p7'],
  ];
  v.byes = ['p6'];
  const revealed = v.matches.slice(0, step + 1).flat();
  const subs: SubmissionView[] = [
    { id: 's2', media: { source: 'system', memeId: 'm1', mediaType: 'image' }, hidden: false, playerId: 'p2', score: { average: 4.25, votes: 12 }, ratingProgress: { received: 30, eligible: 30 } },
    { id: 's5', media: { source: 'system', memeId: 'm3', mediaType: 'gif' }, hidden: false, playerId: 'p5', score: { average: 3.1, votes: 12 }, ratingProgress: { received: 30, eligible: 30 } },
    { id: 's6', media: { source: 'system', memeId: 'm4', mediaType: 'image' }, hidden: false, playerId: 'p4', score: { average: 3.86, votes: 11 }, ratingProgress: { received: 30, eligible: 30 } },
    { id: 's7', media: { source: 'system', memeId: 'm5', mediaType: 'gif' }, hidden: false, playerId: 'p7', score: { average: 2.9, votes: 11 }, ratingProgress: { received: 30, eligible: 30 } },
  ];
  v.submissions = subs.filter((s) => revealed.includes(s.playerId!));
  return v;
}

export function fakeResultsView(now: number, mode: 'elimination' | 'league'): View {
  const config = mode === 'league' ? CONFIG_LEAGUE : CONFIG_ELIMINATION;
  const v = baseView('running', {
    kind: 'results',
    roundNo: 3,
    endsAt: now + 12_000,
  }, config);
  v.prompt = PROMPTS.monday;
  v.participants = participants(7);
  if (mode === 'elimination') {
    v.matches = [
      ['p2', 'p5'],
      ['p4', 'p7'],
    ];
    v.byes = ['p6'];
    v.submissions = [
      { id: 's2', media: { source: 'system', memeId: 'm1', mediaType: 'image' }, hidden: false, playerId: 'p2', score: { average: 4.25, votes: 12 }, ratingProgress: { received: 30, eligible: 30 } },
      { id: 's5', media: { source: 'system', memeId: 'm3', mediaType: 'gif' }, hidden: false, playerId: 'p5', score: { average: 3.1, votes: 12 }, ratingProgress: { received: 30, eligible: 30 } },
      { id: 's6', media: { source: 'system', memeId: 'm4', mediaType: 'image' }, hidden: false, playerId: 'p4', score: { average: 3.86, votes: 11 }, ratingProgress: { received: 30, eligible: 30 } },
      { id: 's7', media: { source: 'system', memeId: 'm5', mediaType: 'gif' }, hidden: false, playerId: 'p7', score: { average: 2.9, votes: 11 }, ratingProgress: { received: 30, eligible: 30 } },
    ];
    v.table = [
      { participantId: 'p2', rank: 1, score: 4.25 },
      { participantId: 'p4', rank: 2, score: 3.86 },
      { participantId: 'p5', rank: 3, score: 3.1 },
      { participantId: 'p7', rank: 4, score: 2.9 },
    ];
  } else {
    v.table = [
      { participantId: 'p2', rank: 1, score: 18.4 },
      { participantId: 'p1', rank: 2, score: 17.1 },
      { participantId: 'p5', rank: 3, score: 15.8 },
      { participantId: 'p3', rank: 4, score: 14.2 },
      { participantId: 'p7', rank: 5, score: 12.6 },
      { participantId: 'p4', rank: 6, score: 9.9 },
    ];
  }
  return v;
}

export function fakeDrawView(now: number): View {
  const v = baseView('running', {
    kind: 'draw',
    roundNo: 3,
    endsAt: now + 4_000,
  }, CONFIG_ELIMINATION);
  v.prompt = PROMPTS.monday;
  v.participants = participants(7);
  v.matches = [];
  return v;
}

/* ----------------------------------- 8 ----------------------------------- */

export function fakeFinishedView(): View {
  const v = baseView('finished', { kind: 'finished' }, CONFIG_ELIMINATION);
  v.participants = participants(7);
  v.stage = { context: 'elimination', round: 4, contenders: ['p2', 'p3'] };
  v.result = {
    champion: 'p2',
    ranking: [
      { participantId: 'p2', rank: 1, score: 0 },
      { participantId: 'p3', rank: 2, score: 0 },
      { participantId: 'p4', rank: 3, score: 0 },
      { participantId: 'p5', rank: 4, score: 0 },
      { participantId: 'p1', rank: 5, score: 0 },
      { participantId: 'p7', rank: 6, score: 0 },
      { participantId: 'p6', rank: 7, score: 0 },
    ],
    jury: {
      harshest: [{ nickname: 'Ayşe', average: 2.4 }],
      mostGenerous: [{ nickname: 'Can', average: 4.8 }],
    },
    reason: 'completed',
  };
  // Sıralamada gösterilecek puanlar; elemede kalan oyuncuların tur puanına göre.
  const scores: Record<string, number> = { p2: 4.25, p3: 3.9, p4: 3.86, p5: 3.1, p1: 2.7, p7: 2.2, p6: 0 };
  v.table = v.result.ranking.map((r) => ({ ...r, score: scores[r.participantId] ?? 0 }));
  return v;
}
