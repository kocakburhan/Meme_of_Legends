import { WebSocket } from 'ws';
import type { SessionConfig } from '@mol/engine';
import {
  serverMessageSchema,
  type ClientCommand,
  type ServerMessage,
  type ShellAction,
} from '@mol/shared';

/**
 * Test yardımcısı: API ile işletme + lobi oluşturur ve yönetici
 * WebSocket'iyle oyunu yönetir (konsol arayüzü M4'te).
 */

export const SERVER = 'http://localhost:8787';
export const WEB = 'http://localhost:5173';

export interface AckResult {
  ok: boolean;
  reason?: string;
}

type ViewMessage = Extract<ServerMessage, { type: 'view' }>;

/** Oda WebSocket istemcilerinin ortak gövdesi: ayrıştırma, bekleme, komut/ack. */
class RoomClient {
  protected waiters: Array<{
    predicate: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
  }> = [];
  protected messages: ServerMessage[] = [];
  protected ws: WebSocket;
  readonly opened: Promise<void>;

  protected constructor(ws: WebSocket) {
    this.ws = ws;
    this.opened = new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
      ws.once('unexpected-response', (_req, res) => reject(new Error(`WS HTTP ${res.statusCode}`)));
      ws.once('close', (code, reason) => {
        if (process.env.MOL_E2E_DEBUG) console.log('[room] WS CLOSE', code, String(reason));
      });
    });
    ws.on('message', (data) => {
      const parsed = serverMessageSchema.safeParse(JSON.parse(String(data)));
      if (!parsed.success) {
        console.log('[room] PARSE FAIL', String(data).slice(0, 200));
        return;
      }
      if (process.env.MOL_E2E_DEBUG)
        console.log('[room] MSG', parsed.data.type, 'seq' in parsed.data ? parsed.data.seq : '');
      this.messages.push(parsed.data);
      // Yalnız eşleşen bekleyiciler çözülür; diğerleri listede kalır.
      const remaining = this.waiters.filter((waiter) => {
        if (waiter.predicate(parsed.data)) {
          if (process.env.MOL_E2E_DEBUG) console.log('[room] bekleyici çözüldü');
          waiter.resolve(parsed.data);
          return false;
        }
        return true;
      });
      this.waiters = remaining;
    });
  }

  protected wait(
    predicate: (m: ServerMessage) => boolean,
    timeoutMs = 20_000,
    label = 'view',
  ): Promise<ServerMessage> {
    const found = this.messages.find(predicate);
    if (found) return Promise.resolve(found);
    if (process.env.MOL_E2E_DEBUG) console.log(`[room] wait(${label}) bekliyor…`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`room ${label} timeout`)), timeoutMs);
      const waiter = {
        predicate,
        resolve: (m: ServerMessage) => {
          if (process.env.MOL_E2E_DEBUG) console.log(`[room] wait(${label}) çözüldü`);
          clearTimeout(timer);
          resolve(m);
        },
      };
      this.waiters.push(waiter);
    });
  }

  async view(
    predicate: (view: ViewMessage['view']) => boolean = () => true,
    timeoutMs = 20_000,
  ): Promise<ViewMessage> {
    const m = (await this.wait(
      (x) => x.type === 'view' && predicate(x.view),
      timeoutMs,
      'view',
    )) as ViewMessage;
    return m;
  }

  /** En son alınan görünüm (yoksa null). */
  latestView(): ViewMessage | null {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i]!;
      if (m.type === 'view') return m;
    }
    return null;
  }

  onMessage(listener: (m: ServerMessage) => void): void {
    this.ws.on('message', (data) => {
      const parsed = serverMessageSchema.safeParse(JSON.parse(String(data)));
      if (parsed.success) listener(parsed.data);
    });
  }

  async command(cmd: ClientCommand, id = crypto.randomUUID()): Promise<AckResult> {
    this.ws.send(JSON.stringify({ type: 'cmd', clientMsgId: id, cmd }));
    return await this.ack(id);
  }

  protected async ack(id: string, timeoutMs = 20_000): Promise<AckResult> {
    const m = await this.wait(
      (x) => x.type === 'ack' && x.clientMsgId === id,
      timeoutMs,
      `ack ${id.slice(0, 8)}`,
    );
    if (m.type !== 'ack') throw new Error('unreachable');
    return { ok: m.ok, ...(m.reason ? { reason: m.reason } : {}) };
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      /* Already closed. */
    }
  }
}

export class ManagerClient extends RoomClient {
  private constructor(ws: WebSocket) {
    super(ws);
  }

  static async connect(code: string, cookie: string): Promise<ManagerClient> {
    const ws = new WebSocket(`ws://localhost:8787/api/rooms/${code}/ws`, {
      headers: { cookie },
    });
    const client = new ManagerClient(ws);
    await client.opened;
    return client;
  }

  /** Yönetici kabuk bilgisini bekler (devri onayları, ekran kodu). */
  async shellInfo(
    predicate: (shell: NonNullable<ViewMessage['shell']>) => boolean,
    timeoutMs = 20_000,
  ): Promise<NonNullable<ViewMessage['shell']>> {
    const m = await this.wait(
      (x) => x.type === 'view' && !!x.shell && predicate(x.shell),
      timeoutMs,
    );
    if (m.type !== 'view' || !m.shell) throw new Error('unreachable');
    return m.shell;
  }

  async shell(action: ShellAction, id = crypto.randomUUID()): Promise<AckResult> {
    this.ws.send(JSON.stringify({ type: 'shell', clientMsgId: id, action }));
    return await this.ack(id);
  }
}

/** Katılımcı WS istemcisi: tarayıcısız oyun oynatma (API+WS) için. */
export class ParticipantClient extends RoomClient {
  private constructor(ws: WebSocket) {
    super(ws);
  }

  static async connect(code: string, token: string): Promise<ParticipantClient> {
    const ws = new WebSocket(
      `ws://localhost:8787/api/rooms/${code}/ws?token=${encodeURIComponent(token)}`,
    );
    const client = new ParticipantClient(ws);
    await client.opened;
    return client;
  }
}

export interface GameLobby extends BusinessLobby {
  manager: ManagerClient;
  close(): void;
}

/** Yalnız API ile işletme + lobi (WebSocket'siz); konsol arayüz testleri için. */
export interface BusinessLobby {
  code: string;
  sessionId: string;
  businessCookie: string;
  username: string;
  password: string;
}

async function login(path: string, body: Record<string, string>): Promise<{ cookie: string }> {
  const res = await fetch(`${SERVER}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  const cookie = res.headers.getSetCookie()[0]?.split(';')[0];
  if (!cookie) throw new Error(`${path} oturum çerezi dönmedi`);
  return { cookie };
}

/** Yalnız API ile işletme hesabı açar ve giriş çerezini döner; panel testleri için. */
export async function createBusiness(
  business: { username: string; password: string } = {
    username: `anka-${crypto.randomUUID().slice(0, 8)}`,
    password: 'anka-kafe-pass-123',
  },
): Promise<{ username: string; password: string; cookie: string }> {
  const admin = await login('/api/auth/admin/login', {
    username: 'e2e-admin',
    password: 'e2e-admin-password-123',
  });
  const created = await fetch(`${SERVER}/api/admin/businesses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: admin.cookie },
    body: JSON.stringify({
      name: 'Anka Kafe',
      username: business.username,
      credits: 5,
      password: business.password,
    }),
  });
  if (!created.ok) throw new Error(`business create → ${created.status} ${await created.text()}`);
  const session = await login('/api/auth/business/login', business);
  return { ...business, cookie: session.cookie };
}

export async function createBusinessAndLobby(
  settings: Partial<SessionConfig>,
  business: { username: string; password: string } = {
    username: `anka-${crypto.randomUUID().slice(0, 8)}`,
    password: 'anka-kafe-pass-123',
  },
): Promise<BusinessLobby> {
  const account = await createBusiness(business);
  const res = await fetch(`${SERVER}/api/business/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: account.cookie },
    body: JSON.stringify({
      settings: {
        mode: 'league',
        leagueRounds: 1,
        selectionSeconds: 30,
        reviewSeconds: 15,
        customContent: false,
        playerApproval: false,
        voterApproval: false,
        acceptVoters: true,
        ...settings,
      },
    }),
  });
  if (!res.ok) throw new Error(`lobby create → ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { session: { id: string; roomCode: string } };
  return {
    code: data.session.roomCode,
    sessionId: data.session.id,
    businessCookie: account.cookie,
    username: account.username,
    password: account.password,
  };
}

export async function createLobby(
  settings: Partial<SessionConfig>,
  business?: { username: string; password: string },
): Promise<GameLobby> {
  const base = await createBusinessAndLobby(settings, business);
  const manager = await ManagerClient.connect(base.code, base.businessCookie);
  return {
    ...base,
    manager,
    close() {
      manager.close();
    },
  };
}

/** Yönetici ekran eşleştirme kodu üretir ve bekler. */
export async function createDisplayPairCode(
  manager: ManagerClient,
): Promise<{ code: string; expiresAt: number }> {
  const ack = await manager.shell({ kind: 'createDisplayPairCode' });
  if (!ack.ok) throw new Error(`pair code → ${ack.reason}`);
  const info = await manager.shellInfo((s) => s.displayPairCode !== null);
  return info.displayPairCode!;
}

export interface ApiJoin {
  participantId: string;
  nickname: string;
  client: ParticipantClient;
}

/** Katılımcıyı HTTP ile odaya sokar ve WS istemcisini bağlar (tarayıcısız oyun). */
export async function joinViaApi(
  code: string,
  nickname: string,
  wants: 'player' | 'voter' = 'player',
): Promise<ApiJoin> {
  const res = await fetch(`${SERVER}/api/rooms/${code}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname, wants }),
  });
  if (!res.ok) throw new Error(`join ${nickname} → ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { participantId: string; token: string };
  const client = await ParticipantClient.connect(code, data.token);
  return { participantId: data.participantId, nickname, client };
}

/** Gönderi gösteriminde slota göre puan: farklı ortalamalar → net sıralama. */
const SLOT_SCORES = [5, 3, 2, 1, 4];

/**
 * API+WS ile kısa lig oyunu oynatır: oyuncular kütüphaneden meme seçip onaylar,
 * gösterimde slota göre puanlar, gözden geçirmeyi bitirir; yönetici sonuç
 * ekranını geçer. Oyun `finished` aşamasına ulaşınca döner (1 tur, 2 oyuncu).
 */
export async function playQuickLeagueGame(lobby: GameLobby, players: ApiJoin[]): Promise<void> {
  const media = { source: 'system' as const, memeId: 'm-e2e-0', mediaType: 'image' as const };

  for (const player of players) await player.client.view((v) => v.phase.kind === 'lobby');
  if (!(await lobby.manager.command({ type: 'start' })).ok) throw new Error('start reddedildi');

  // Seçim: her oyuncu seçer ve onaylar; son onay aşamayı erken bitirir (SPEC 5.4).
  for (const player of players) {
    await player.client.view((v) => v.phase.kind === 'selection');
    if (!(await player.client.command({ type: 'select', media })).ok)
      throw new Error(`select ${player.nickname} reddedildi`);
    if (!(await player.client.command({ type: 'confirm' })).ok)
      throw new Error(`confirm ${player.nickname} reddedildi`);
  }

  // Gönderi gösterimi: slotta puan verebilen (rakip) puanlar (SPEC 7.2).
  for (let index = 0; index < players.length; index++) {
    await Promise.all(
      players.map(async (player) => {
        const m = await player.client.view(
          (v) => v.phase.kind === 'presentation' && v.presentation?.index === index,
        );
        if (m.type !== 'view') throw new Error('unreachable');
        const sub = m.view.submissions[0];
        if (!sub?.id || !sub.canRate) return;
        const ack = await player.client.command({
          type: 'rate',
          submissionId: sub.id,
          score: (SLOT_SCORES[index] ?? 3) as 1 | 2 | 3 | 4 | 5,
        });
        if (!ack.ok) throw new Error(`rate ${player.nickname} → ${ack.reason}`);
      }),
    );
  }

  // Final gözden geçirme: bağlı herkes bitirir; aşama kapanır (SPEC 7.3).
  for (const player of players) {
    await player.client.view((v) => v.phase.kind === 'review');
    if (!(await player.client.command({ type: 'finishReview' })).ok)
      throw new Error(`finishReview ${player.nickname} reddedildi`);
  }

  // Sonuç ekranında yönetici geçer; 1 turluk lig → oyun 'finished' olur.
  await lobby.manager.view((v) => v.phase.kind === 'results');
  if (!(await lobby.manager.command({ type: 'skipResults' })).ok)
    throw new Error('skipResults reddedildi');
  await lobby.manager.view((v) => v.phase.kind === 'finished' && v.status === 'finished');
}
