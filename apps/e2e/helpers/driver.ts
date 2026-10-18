import { WebSocket } from 'ws';
import type { SessionConfig } from '@mol/engine';
import {
  serverMessageSchema,
  type ManagerCommand,
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

export class ManagerClient {
  private waiters: Array<{
    predicate: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
  }> = [];
  private messages: ServerMessage[] = [];
  private ws: WebSocket;
  readonly opened: Promise<void>;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    this.opened = new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
      ws.once('unexpected-response', (_req, res) =>
        reject(new Error(`WS HTTP ${res.statusCode}`)),
      );
    });
    ws.on('message', (data) => {
      const parsed = serverMessageSchema.safeParse(JSON.parse(String(data)));
      if (!parsed.success) return;
      this.messages.push(parsed.data);
      for (const waiter of this.waiters.splice(0))
        if (waiter.predicate(parsed.data)) waiter.resolve(parsed.data);
    });
  }

  static async connect(code: string, cookie: string): Promise<ManagerClient> {
    const ws = new WebSocket(`ws://localhost:8787/api/rooms/${code}/ws`, {
      headers: { cookie },
    });
    const client = new ManagerClient(ws);
    await client.opened;
    return client;
  }

  private wait(predicate: (m: ServerMessage) => boolean, timeoutMs = 20_000): Promise<ServerMessage> {
    const found = this.messages.find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('manager view timeout')), timeoutMs);
      const waiter = {
        predicate,
        resolve: (m: ServerMessage) => {
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
    )) as ViewMessage;
    return m;
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

  async command(cmd: ManagerCommand, id = crypto.randomUUID()): Promise<AckResult> {
    this.ws.send(JSON.stringify({ type: 'cmd', clientMsgId: id, cmd }));
    return await this.ack(id);
  }

  async shell(action: ShellAction, id = crypto.randomUUID()): Promise<AckResult> {
    this.ws.send(JSON.stringify({ type: 'shell', clientMsgId: id, action }));
    return await this.ack(id);
  }

  private ack(id: string, timeoutMs = 20_000): Promise<AckResult> {
    return this.wait((m) => m.type === 'ack' && m.clientMsgId === id, timeoutMs).then((m) => {
      if (m.type !== 'ack') throw new Error('unreachable');
      return { ok: m.ok, ...(m.reason ? { reason: m.reason } : {}) };
    });
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      /* Already closed. */
    }
  }
}

export interface GameLobby {
  code: string;
  sessionId: string;
  manager: ManagerClient;
  businessCookie: string;
  close(): void;
}

async function login(
  path: string,
  body: Record<string, string>,
): Promise<{ cookie: string }> {
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

export async function createLobby(
  settings: Partial<SessionConfig>,
  business: { username: string; password: string } = {
    username: `anka-${crypto.randomUUID().slice(0, 8)}`,
    password: 'anka-kafe-pass-123',
  },
): Promise<GameLobby> {
  const admin = await login('/api/auth/admin/login', {
    username: 'e2e-admin',
    password: 'e2e-admin-password-123',
  });
  const created = await fetch(`${SERVER}/api/admin/businesses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: admin.cookie },
    body: JSON.stringify({ name: 'Anka Kafe', username: business.username, credits: 5, password: business.password }),
  });
  if (!created.ok) throw new Error(`business create → ${created.status} ${await created.text()}`);
  const session = await login('/api/auth/business/login', business);
  const res = await fetch(`${SERVER}/api/business/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: session.cookie },
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
  const manager = await ManagerClient.connect(data.session.roomCode, session.cookie);
  return {
    code: data.session.roomCode,
    sessionId: data.session.id,
    manager,
    businessCookie: session.cookie,
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
