export type Mode = 'elimination' | 'league' | 'hybrid';
export type Context = 'elimination' | 'league' | 'semifinal' | 'final';
export interface SessionConfig {
  mode: Mode;
  leagueRounds: number;
  selectionSeconds: number;
  reviewSeconds: number;
  customContent: boolean;
  playerApproval: boolean;
  voterApproval: boolean;
  acceptVoters: boolean;
}
export const DEFAULT_CONFIG: SessionConfig = {
  mode: 'hybrid',
  leagueRounds: 10,
  selectionSeconds: 60,
  reviewSeconds: 45,
  customContent: true,
  playerApproval: false,
  voterApproval: false,
  acceptVoters: true,
};
export interface TimingConstants {
  imageWatchMs: number;
  imageLastCallMs: number;
  videoMinMs: number;
  videoLastCallMs: number;
  resultsMs: number;
  revealStepMs: number;
  overtimeSelectionMs: number;
  promptReplaceMs: number;
  drawMs: number;
  emptyRoomMs: number;
}
export const DEFAULT_TIMING: TimingConstants = {
  imageWatchMs: 12_000,
  imageLastCallMs: 3_000,
  videoMinMs: 12_000,
  videoLastCallMs: 5_000,
  resultsMs: 15_000,
  revealStepMs: 1_500,
  overtimeSelectionMs: 30_000,
  promptReplaceMs: 15_000,
  drawMs: 5_000,
  emptyRoomMs: 600_000,
};
export interface PromptRef {
  id: string;
  text: string;
  owner: string;
}
export interface Ctx {
  now: number;
  prompts: PromptRef[];
  timing: TimingConstants;
}
export interface SessionInit {
  seed: number;
  config?: Partial<SessionConfig>;
}
export interface Participant {
  id: string;
  nickname: string;
  role: 'player' | 'voter';
  status: 'pending' | 'active' | 'left' | 'kicked';
  connected: boolean;
  votingFromRound: number;
  byeCount: number;
  joinedAt: number;
  needsNickname: boolean;
  eliminated: boolean;
  withdrawn: boolean;
}
export type Phase =
  | { kind: 'lobby' }
  | { kind: 'selection'; roundNo: number; endsAt: number; promptReplaceUntil: number }
  | { kind: 'presentation'; roundNo: number; index: number; lastCallAt: number; endsAt: number }
  | { kind: 'review'; roundNo: number; endsAt: number }
  | { kind: 'reveal'; roundNo: number; step: number; nextStepAt: number }
  | { kind: 'results'; roundNo: number; endsAt: number }
  | { kind: 'draw'; roundNo: number; endsAt: number }
  | { kind: 'finished' };
export type MediaRef =
  | { source: 'system'; memeId: string; mediaType: 'image' | 'gif' | 'video'; durationMs?: number }
  | { source: 'upload'; uploadId: string; mediaType: 'image' | 'gif' }
  | { source: 'youtube'; videoId: string; startMs: number; endMs: number };
export interface Submission {
  id: string;
  playerId: string;
  media: MediaRef | null;
  confirmed: boolean;
  invalid: boolean;
  hidden: boolean;
  compensation: boolean;
  customType: 'image' | 'gif' | 'youtube' | null;
}
export interface Score {
  average: number;
  votes: number;
}
export type Match = [string, string];
export interface Round {
  no: number;
  kind: 'regular' | 'overtime';
  context: Context;
  stageRound: number;
  prompt: PromptRef;
  promptReplaced: boolean;
  config: SessionConfig;
  players: string[];
  matches: Match[];
  byes: string[];
  submissions: Record<string, Submission>;
  order: string[];
  ratings: Record<string, Record<string, number>>;
  eligibility: Record<string, string[]>;
  reviewFinished: string[];
  scores: Record<string, Score>;
  locked: boolean;
  tieGroups: string[][];
  resolution: string[][];
  needsDraw: boolean;
}
export interface StageState {
  context: Context;
  round: number;
  contenders: string[];
  matches: Match[];
  leagueTotals: Record<string, number>;
  matchTotals: Record<string, number>;
  leagueOrder: string[];
  semifinalLosers: string[];
  finalLoser: string | null;
  eliminated: Record<string, { round: number; score: number }>;
  pending: 'next' | 'semifinal' | 'final' | 'finish';
  tieGroups: string[][];
  resolved: string[][];
  champion: string | null;
  qualified: boolean;
}
export interface Ranking {
  participantId: string;
  rank: number;
  score: number;
}
export interface JuryEntry {
  nickname: string;
  average: number;
}
export interface FinalResult {
  champion: string | null;
  ranking: Ranking[];
  jury: { harshest: JuryEntry[]; mostGenerous: JuryEntry[] } | null;
  reason: 'completed' | 'players' | 'manager' | 'empty' | 'noPrompts';
}
export interface EngineState {
  version: number;
  rng: number;
  config: SessionConfig;
  status: 'lobby' | 'running' | 'paused' | 'finished' | 'terminated';
  participants: Record<string, Participant>;
  phase: Phase;
  rounds: Round[];
  stage: StageState;
  usedPromptIds: Record<string, number>;
  promptDraw: number;
  promptPreview: PromptRef | null;
  previewReplaced: boolean;
  pausedFrom: Phase | null;
  pausedAt: number | null;
  lastNow: number;
  emptySince: number | null;
  result: FinalResult | null;
}
export type Command =
  | { type: 'updateSettings'; patch: Partial<SessionConfig> }
  | {
      type:
        | 'approveParticipant'
        | 'rejectParticipant'
        | 'rejectCustom'
        | 'moveToVoter'
        | 'kick'
        | 'resetNickname';
      participantId: string;
    }
  | {
      type:
        | 'start'
        | 'pause'
        | 'resume'
        | 'replacePrompt'
        | 'hideCurrent'
        | 'closeReview'
        | 'skipResults'
        | 'endGame'
        | 'tick'
        | 'restore';
    }
  | { type: 'addTime'; seconds: 15 | 30 | 60 }
  | { type: 'join'; participantId: string; nickname: string; wants: 'player' | 'voter' }
  | { type: 'select'; participantId: string; media: MediaRef }
  | { type: 'confirm' | 'finishReview' | 'leaveToVoter'; participantId: string }
  | { type: 'rate'; participantId: string; submissionId: string; score: 1 | 2 | 3 | 4 | 5 }
  | { type: 'changeNickname'; participantId: string; nickname: string }
  | { type: 'connection'; participantId: string; connected: boolean };
// Events are privileged audit data. Broadcast only viewer projections, never raw event payloads.
export interface EngineEvent {
  type: string;
  [key: string]: unknown;
}
export type Viewer =
  { kind: 'participant'; participantId: string } | { kind: 'manager' } | { kind: 'display' };
export interface SubmissionView {
  id: string;
  media: MediaRef | null;
  hidden: boolean;
  playerId?: string;
  score?: Score;
  ownScore?: number;
  canRate?: boolean;
  ratingProgress?: { received: number; eligible: number };
}
export interface View {
  review?: { finished: number; eligible: number };
  isFinalRound?: boolean;
  status: EngineState['status'];
  phase: Phase;
  config: SessionConfig;
  participants: {
    id: string;
    nickname: string;
    role: Participant['role'];
    ready: boolean;
    status?: Participant['status'];
    connected?: boolean;
    joinedAt?: number;
    needsNickname?: boolean;
  }[];
  spectatorCount: number;
  prompt: PromptRef | null;
  matches: Match[];
  byes: string[];
  submissions: SubmissionView[];
  ownSubmission?: Submission | null;
  promptPreview?: PromptRef | null;
  result: FinalResult | null;
  stage: { context: Context; round: number; contenders?: string[] };
  table: Ranking[];
  completedRounds: { no: number; submissions: SubmissionView[] }[];
  /** Presentation position while the phase runs: submission index and total count. */
  presentation?: { index: number; total: number };
  /** Participant's own submission in the current round; sender identity stays hidden. */
  ownSubmissionId?: string | null;
}
