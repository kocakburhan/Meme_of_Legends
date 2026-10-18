import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import WebSocket from 'ws';
import type { ClientCommand, ServerMessage, View } from '@mol/shared';
import { phaseKey, PhaseMetrics, summary } from './metrics.js';
import { shouldSelect } from './decisions.js';

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: Object.fromEntries(
    [
      'url',
      'players',
      'voters',
      'mode',
      'rounds',
      'room',
      'report',
      'timeout',
      'reconnect-rate',
      'meme-id',
    ].map((k) => [k, { type: 'string' as const }]),
  ),
});
const base = new URL(values.url ?? 'http://127.0.0.1:8787');
function integer(key: string, fallback: number, min: number, max: number) {
  const n = Number(values[key] ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Geçersiz --${key}`);
  return n;
}
const players = integer('players', 16, 2, 300);
const voters = integer('voters', 284, 0, 300);
if (players + voters > 300) throw new Error('Toplam katılımcı en fazla 300 olabilir');
const rounds = integer('rounds', 2, 1, 50);
const timeout = integer('timeout', 1200, 10, 86400) * 1000;
const reconnectRate = Number(values['reconnect-rate'] ?? 0.05);
if (!Number.isFinite(reconnectRate) || reconnectRate < 0 || reconnectRate > 1)
  throw new Error('Geçersiz kopma oranı');
const mode = values.mode ?? 'league';
if (!['league', 'hybrid', 'elimination'].includes(mode)) throw new Error('Geçersiz mod');
const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
if (!values.room && !local) throw new Error('Uzak ortam için --room zorunlu');
const latencies: number[] = [],
  connections: number[] = [];
const phases = new PhaseMetrics();
const errors: Record<string, number> = {};
const acceptedCommands: Record<string, number> = {};
let disconnects = 0,
  plannedDisconnects = 0,
  reconnects = 0,
  stopped = false;
const clients: Bot[] = [];
const timers = new Set<ReturnType<typeof setTimeout>>();
function error(reason: string) {
  errors[reason] = (errors[reason] ?? 0) + 1;
}
async function api(path: string, body: unknown, cookie = '') {
  const response = await fetch(new URL(path, base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  return {
    data: await response.json(),
    cookie: response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; '),
  };
}
function credentials(role: 'ADMIN' | 'BUSINESS') {
  const username = process.env[`MOL_${role}_USERNAME`],
    password = process.env[`MOL_${role}_PASSWORD`];
  if (!username || !password)
    throw new Error(`MOL_${role}_USERNAME ve MOL_${role}_PASSWORD gerekli`);
  return { username, password };
}
let room = values.room ?? '';
let managerCookie: string;
let managerView: View | undefined;
const started = Date.now();
class Bot {
  socket?: WebSocket;
  view?: View;
  lastPhase?: string;
  busy = false;
  seen = new Set<string>();
  pending = new Map<
    string,
    {
      at: number;
      resolve: () => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  retry = 0;
  constructor(
    readonly id: string,
    readonly token = '',
    readonly cookie = '',
  ) {
    clients.push(this);
  }
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const at = performance.now();
      const url = new URL(`/api/rooms/${room}/ws`, base);
      url.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
      if (this.token) url.searchParams.set('token', this.token);
      const socket = new WebSocket(url, {
        headers: this.cookie ? { cookie: this.cookie } : {},
        handshakeTimeout: 30_000,
      });
      this.socket = socket;
      let ready = false;
      const initialTimer = setTimeout(() => {
        reject(new Error('İlk görünüm zaman aşımı'));
        socket.terminate();
      }, 30_000);
      socket.on('message', (raw) => {
        try {
          const message = JSON.parse(raw.toString()) as ServerMessage;
          if (message.type === 'ack') {
            const pending = this.pending.get(message.clientMsgId);
            if (!pending) return;
            clearTimeout(pending.timer);
            this.pending.delete(message.clientMsgId);
            latencies.push(performance.now() - pending.at);
            if (message.ok) pending.resolve();
            else {
              error(message.reason ?? 'ACK_REJECTED');
              pending.reject(new Error(message.reason));
            }
          } else if (message.type === 'view') {
            this.view = message.view;
            const key = phaseKey(message.view);
            if (ready && key !== this.lastPhase)
              phases.observe(key, this.id, Date.now(), message.serverNow);
            this.lastPhase = key;
            if (this.id === 'manager') managerView = message.view;
            if (!ready) {
              ready = true;
              clearTimeout(initialTimer);
              connections.push(performance.now() - at);
              this.retry = 0;
              resolve();
            }
            if (this.token) void this.act();
          } else if (message.type === 'closed') error(`CLOSED_${message.reason}`);
        } catch (e) {
          error(`MESSAGE_${String(e)}`);
        }
      });
      socket.on('error', (e) => {
        if (!stopped)
          error(
            `SOCKET_ERROR_${'code' in e ? String(e.code) : (e.message.match(/Unexpected server response: \d+/)?.[0] ?? e.name)}`,
          );
        if (!ready) reject(e);
      });
      socket.on('close', () => {
        clearTimeout(initialTimer);
        for (const p of this.pending.values()) {
          clearTimeout(p.timer);
          error('ACK_CONNECTION_LOST');
          p.reject(new Error('Bağlantı koptu'));
        }
        this.pending.clear();
        if (!ready) reject(new Error('Bağlantı açılamadı'));
        if (stopped) return;
        disconnects++;
        const timer = setTimeout(
          () => {
            timers.delete(timer);
            if (!stopped) {
              reconnects++;
              void this.connect().catch(() => {});
            }
          },
          Math.min(5000, 250 * 2 ** this.retry++) + Math.random() * 250,
        );
        timers.add(timer);
      });
    });
  }
  command(cmd: ClientCommand): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.readyState !== WebSocket.OPEN) return reject(new Error('Socket kapalı'));
      const clientMsgId = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(clientMsgId);
        error('ACK_TIMEOUT');
        reject(new Error('ACK zaman aşımı'));
      }, 30_000);
      this.pending.set(clientMsgId, {
        at: performance.now(),
        resolve: () => {
          acceptedCommands[cmd.type] = (acceptedCommands[cmd.type] ?? 0) + 1;
          resolve();
        },
        reject,
        timer,
      });
      this.socket.send(JSON.stringify({ type: 'cmd', clientMsgId, cmd }));
    });
  }
  async act() {
    if (this.busy || stopped) return;
    this.busy = true;
    try {
      const view = this.view!;
      const phase = view.phase;
      const once = async (key: string, action: () => Promise<void>) => {
        if (this.seen.has(key)) return;
        this.seen.add(key);
        try {
          await action();
        } catch (e) {
          this.seen.delete(key);
          throw e;
        }
      };
      if (phase.kind === 'selection' && shouldSelect(view, this.id, managerView)) {
        await once(`select${phase.roundNo}`, async () => {
          await this.command({
            type: 'select',
            media: {
              source: 'system',
              memeId: values['meme-id'] ?? 'loadtest-image',
              mediaType: 'image',
            },
          });
          await this.command({ type: 'confirm' });
        });
      }
      if (phase.kind === 'presentation' || phase.kind === 'review') {
        for (const submission of view.submissions.filter((s) => s.canRate)) {
          await once(`rate${phase.roundNo}${submission.id}`, () =>
            this.command({
              type: 'rate',
              submissionId: submission.id,
              score: (Math.floor(Math.random() * 5) + 1) as 1 | 2 | 3 | 4 | 5,
            }),
          );
        }
        if (phase.kind === 'review')
          await once(`finish${phase.roundNo}`, () => this.command({ type: 'finishReview' }));
      }
    } catch {
      /* Acks and connection losses are counted at their source. */
    } finally {
      this.busy = false;
    }
  }
}
process.once('SIGINT', () => {
  stopped = true;
});
process.once('SIGTERM', () => {
  stopped = true;
});
let failure: string | null = null;
try {
  if (room) {
    managerCookie = (await api('/api/auth/business/login', credentials('BUSINESS'))).cookie;
  } else {
    const adminCookie = (await api('/api/auth/admin/login', credentials('ADMIN'))).cookie;
    const username = `load${Date.now()}`;
    const password = crypto.randomUUID();
    await api(
      '/api/admin/businesses',
      { name: 'Yük Testi', username, password, credits: 1 },
      adminCookie,
    );
    managerCookie = (await api('/api/auth/business/login', { username, password })).cookie;
    const lobby = await api(
      '/api/business/sessions',
      {
        settings: {
          mode,
          leagueRounds: rounds,
          selectionSeconds: 30,
          reviewSeconds: 15,
          playerApproval: false,
          voterApproval: false,
          acceptVoters: true,
          customContent: false,
        },
      },
      managerCookie,
    );
    room = lobby.data.session.roomCode;
  }
  console.log(`Oda: ${room}; katılımcı: ${players + voters}`);
  const manager = new Bot('manager', '', managerCookie);
  await manager.connect();
  if (managerView?.phase.kind !== 'lobby') throw new Error('Oda lobide olmalı');
  // Bounded HTTP admission; sockets remain concurrently open throughout the game.
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(8, players + voters) }, async () => {
      while (next < players + voters) {
        const index = next++;
        const joined = await api(`/api/rooms/${room}/join`, {
          nickname: `Bot ${index + 1}`,
          wants: index < players ? 'player' : 'voter',
        });
        await new Bot(joined.data.participantId, joined.data.token).connect();
      }
    }),
  );
  await manager.command({ type: 'start' });
  while (!stopped && Date.now() - started < timeout) {
    if (managerView?.status === 'finished' || managerView?.status === 'terminated') break;
    for (const bot of clients.filter((c) => c.token)) {
      void bot.act();
      if (bot.socket?.readyState === WebSocket.OPEN && Math.random() < reconnectRate / 20) {
        plannedDisconnects++;
        bot.socket.close();
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!acceptedCommands.confirm || !acceptedCommands.rate || !acceptedCommands.finishReview)
    throw new Error('Seçim, puanlama ve gözden geçirme komutları doğrulanamadı');
  if (managerView?.result?.reason !== 'completed')
    throw new Error(`Oyun tamamlanmadı: ${managerView?.result?.reason ?? managerView?.phase.kind}`);
} catch (e) {
  failure = String(e);
  error('RUN_FAILED');
} finally {
  stopped = true;
  for (const timer of timers) clearTimeout(timer);
  for (const bot of clients) {
    for (const p of bot.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('Koşu sonlandı'));
    }
    bot.pending.clear();
    bot.socket?.terminate();
  }
  const ack = summary(latencies),
    sync = phases.report(players + voters + 1);
  const report = {
    room,
    players,
    voters,
    mode,
    rounds,
    durationMs: Date.now() - started,
    completed: managerView?.result?.reason === 'completed',
    failure,
    connectionMs: summary(connections),
    ackMs: ack,
    phaseSpread: sync,
    errors,
    acceptedCommands,
    settings: managerView?.config,
    disconnects,
    plannedDisconnects,
    reconnects,
    targets: {
      ackWithin1s: ack.max !== null && ack.max <= 1000,
      phaseWithin1s: sync.localMs.max !== null && sync.localMs.max <= 1000,
    },
    result: managerView?.result ?? null,
  };
  await writeFile(values.report ?? 'loadtest-report.json', JSON.stringify(report, null, 2) + '\n');
  console.table({
    'Bağlantı (ms)': report.connectionMs,
    'ACK (ms)': ack,
    'Aşama yerel (ms)': sync.localMs,
    'Aşama serverNow (ms)': sync.serverNowMs,
  });
  console.log(
    JSON.stringify({
      completed: report.completed,
      errors,
      acceptedCommands,
      settings: managerView?.config,
      disconnects,
      reconnects,
      targets: report.targets,
      failure,
    }),
  );
  if (
    failure ||
    Object.keys(errors).length ||
    !report.targets.ackWithin1s ||
    !report.targets.phaseWithin1s
  )
    process.exitCode = 1;
}
