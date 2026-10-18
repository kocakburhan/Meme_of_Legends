import { currentRound, eligibleParticipant } from './competition.js';
import type { Ctx, EngineState, Round, Submission, SubmissionView, View, Viewer } from './types.js';

/** Construct an allowlisted JSON view; returning a clone prevents caller mutation of engine state. */
export function project(state: EngineState, viewer: Viewer, _ctx: Ctx): View {
  const s = state,
    r = currentRound(s),
    manager = viewer.kind === 'manager';
  const id = viewer.kind === 'participant' ? viewer.participantId : null;
  const participant = id ? s.participants[id] : undefined;
  const admitted = !id || participant?.status === 'active';
  function submissionView(round: Round, sub: Submission, reveal: boolean): SubmissionView {
    const eligible = (round.eligibility[sub.id] ?? []).filter((x) =>
      eligibleParticipant(s, x, round),
    );
    const v: SubmissionView = {
      id: sub.id,
      media: sub.hidden || sub.invalid ? null : sub.media,
      hidden: sub.hidden,
    };
    if (manager || reveal) v.playerId = sub.playerId;
    if (reveal && round.scores[sub.playerId])
      v.score = {
        average: Number(round.scores[sub.playerId]!.average.toFixed(2)),
        votes: round.scores[sub.playerId]!.votes,
      };
    if (!round.locked && s.phase.kind !== 'selection') {
      v.ratingProgress = {
        received: Object.values(round.ratings).filter((v) => v[sub.id] !== undefined).length,
        eligible: eligible.length,
      };
      if (id) {
        v.canRate = s.status === 'running' && !sub.invalid && !sub.hidden && eligible.includes(id);
        v.ownScore = round.ratings[id]?.[sub.id];
      }
    }
    return v;
  }
  let submissions: SubmissionView[] = [];
  if (r && admitted) {
    if (manager)
      submissions = Object.values(r.submissions).map((sub) => submissionView(r, sub, r.locked));
    else if (s.phase.kind === 'presentation') {
      const sub = r.submissions[r.order[s.phase.index]!]!;
      submissions = [submissionView(r, sub, false)];
    } else if (s.phase.kind === 'review' && viewer.kind === 'participant')
      submissions = r.order.map((key) => submissionView(r, r.submissions[key]!, false));
    else if (r.locked) {
      let ids = r.players;
      if (s.phase.kind === 'reveal')
        ids = r.matches.length
          ? r.matches.slice(0, s.phase.step + 1).flat()
          : r.players.slice(0, s.phase.step + 1);
      submissions = Object.values(r.submissions)
        .filter((sub) => ids.includes(sub.playerId))
        .map((sub) => submissionView(r, sub, true));
    }
  }
  const showTable = manager || ['results', 'draw', 'finished'].includes(s.phase.kind);
  const totals = s.stage.context === 'league' ? s.stage.leagueTotals : s.stage.matchTotals;
  const tableIds = showTable
    ? Object.keys(totals)
        .filter((key) => {
          const p = s.participants[key];
          return (
            p &&
            !p.withdrawn &&
            (p.role === 'player' || p.eliminated) &&
            (s.stage.context === 'league' || r?.players.includes(key))
          );
        })
        .sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0))
    : [];
  let rank = 0;
  const table = tableIds.map((key, index) => {
    if (!index || totals[key] !== totals[tableIds[index - 1]!]) rank = index + 1;
    return { participantId: key, rank, score: Number((totals[key] ?? 0).toFixed(2)) };
  });
  const view: View = {
    stage: {
      context: s.stage.context,
      round: s.stage.round,
      ...(showTable ? { contenders: s.stage.contenders } : {}),
    },
    table: s.result?.ranking ?? table,
    status: s.status,
    phase: s.phase,
    config: s.config,
    participants: Object.values(s.participants)
      .filter((p) => manager || p.status === 'active')
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        role: p.role,
        ready:
          !!r &&
          Object.values(r.submissions).some(
            (x) => x.playerId === p.id && x.confirmed && !x.invalid,
          ),
        ...(manager
          ? {
              status: p.status,
              connected: p.connected,
              joinedAt: p.joinedAt,
              needsNickname: p.needsNickname,
            }
          : {}),
      })),
    spectatorCount: Object.values(s.participants).filter(
      (p) => p.role === 'voter' && p.status === 'active',
    ).length,
    prompt: admitted ? (r?.prompt ?? null) : null,
    matches: admitted ? (r?.matches ?? []) : [],
    byes: admitted ? (r?.byes ?? []) : [],
    submissions,
    result: s.result,
    completedRounds: admitted
      ? s.rounds
          .filter((x) => x !== r && x.locked)
          .map((round) => ({
            no: round.no,
            submissions: Object.values(round.submissions).map((sub) =>
              submissionView(round, sub, true),
            ),
          }))
      : [],
  };
  if (manager) view.promptPreview = s.promptPreview;
  if (id && admitted && s.phase.kind === 'selection')
    view.ownSubmission = Object.values(r?.submissions ?? {}).find((x) => x.playerId === id) ?? null;
  return JSON.parse(JSON.stringify(view)) as View;
}
