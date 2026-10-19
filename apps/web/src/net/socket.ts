import { serverMessageSchema, type ClientCommand, type ServerMessage } from '@mol/shared';

/**
 * WebSocket istemcisi (protokol v0.2 §3–4): tek bir odaya bağlanır, mesajları
 * şemayla doğrular, komutları benzersiz `clientMsgId` ile gönderir ve ack
 * bekler. Bağlantı koparsa üstel beklemeyle yeniden bağlanır; uygulanmamış
 * komutlar aynı kimlikle yeniden gönderilir (sunucu tekilleştirir). Saat
 * farkı `serverNow`/pong çiftinden hesaplanır. Çerçeveden bağımsızdır;
 * konsol ve paneller de kullanabilir.
 */

export type SocketState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export type SocketReason = Extract<
  Extract<ServerMessage, { type: 'closed' }>['reason'],
  string
> | null;

export interface AckResult {
  ok: boolean;
  reason?: string;
}

export interface SocketHandlers {
  onState?: (state: SocketState, reason: SocketReason) => void;
  onMessage?: (message: ServerMessage) => void;
}

export interface SocketOptions {
  /** 6 karakterlik oda kodu. */
  code: string;
  /** Katılımcı ya da ekran token'ı. */
  token: string;
  handlers?: SocketHandlers;
}

export function roomSocketUrl(code: string, token: string): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/api/rooms/${code}/ws?token=${encodeURIComponent(token)}`;
}

const PING_INTERVAL_MS = 20_000;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8_000;
const ACK_TIMEOUT_MS = 12_000;

export class RoomSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private pending = new Map<string, PendingCommand>();
  private queue: string[] = [];
  private clockOffset: number | null = null;
  private lastPingSentAt = 0;
  private terminated = false;
  private stopped = false;
  private state: SocketState = 'closed';
  private reason: SocketReason = null;

  constructor(private readonly options: SocketOptions) {}

  private setState(state: SocketState, reason: SocketReason = null) {
    if (this.state === state && this.reason === reason) return;
    this.state = state;
    this.reason = reason;
    this.options.handlers?.onState?.(state, reason);
  }

  connect(): void {
    this.stopped = false;
    this.open();
  }

  close(): void {
    this.stopped = true;
    this.clearTimers();
    for (const [, waiter] of this.pending) waiter.reject(new Error('SOCKET_CLOSED'));
    this.pending.clear();
    this.queue = [];
    try {
      this.ws?.close(1000, 'client');
    } catch {
      /* Already closed. */
    }
    this.ws = null;
    this.setState('closed');
  }

  private clearTimers() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private open(): void {
    this.clearTimers();
    this.setState(this.attempt === 0 ? 'connecting' : 'reconnecting', this.reason);
    let socket: WebSocket;
    try {
      socket = new WebSocket(roomSocketUrl(this.options.code, this.options.token));
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;
    socket.addEventListener('open', () => {
      this.attempt = 0;
      this.setState('open');
      const queued = this.queue;
      this.queue = [];
      const resent = [...queued];
      // Unacked commands are re-sent with their original clientMsgId (§3.3).
      for (const [, waiter] of this.pending) resent.push(waiter.payload);
      for (const payload of resent) this.rawSend(payload);
      this.pingTimer = window.setInterval(() => {
        this.lastPingSentAt = Date.now();
        this.rawSend(JSON.stringify({ type: 'ping', t: this.lastPingSentAt }));
      }, PING_INTERVAL_MS);
    });
    socket.addEventListener('message', (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const result = serverMessageSchema.safeParse(parsed);
      if (!result.success) return;
      const message = result.data;
      if (message.type === 'pong') {
        const rtt = Date.now() - message.t;
        const sample = message.serverNow - (message.t + rtt / 2);
        this.clockOffset = this.clockOffset === null ? sample : this.clockOffset * 0.7 + sample * 0.3;
        return;
      }
      if (message.type === 'ack') {
        const waiter = this.pending.get(message.clientMsgId);
        if (waiter) {
          this.pending.delete(message.clientMsgId);
          window.clearTimeout(waiter.timeout);
          waiter.resolve({ ok: message.ok, ...(message.reason ? { reason: message.reason } : {}) });
        }
        return;
      }
      if (message.type === 'closed') {
        this.terminated = true;
        this.clearTimers();
        try {
          this.ws?.close(1000, message.reason);
        } catch {
          /* Already closed. */
        }
        this.ws = null;
        this.setState('closed', message.reason);
        return;
      }
      // view / cue / recovery ekran katmanına iletilir.
      this.options.handlers?.onMessage?.(message);
    });
    socket.addEventListener('close', () => {
      this.ws = null;
      this.clearTimers();
      if (this.stopped || this.terminated) {
        if (!this.terminated) this.setState('closed');
        return;
      }
      this.scheduleReconnect();
    });
    socket.addEventListener('error', () => {
      /* Close handler drives reconnection. */
    });
  }

  private scheduleReconnect(): void {
    this.setState('reconnecting', this.reason);
    const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** this.attempt);
    this.attempt++;
    this.reconnectTimer = window.setTimeout(
      () => this.open(),
      backoff + Math.floor(Math.random() * 250),
    );
  }

  private rawSend(payload: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(payload);
    else this.queue.push(payload);
  }

  /** Motor komutu; bağlantı yoksa sıraya girer, ack gelince çözülür. */
  sendCommand(cmd: ClientCommand, clientMsgId: string = crypto.randomUUID()): Promise<AckResult> {
    if (this.terminated || this.stopped) return Promise.reject(new Error('SOCKET_CLOSED'));
    const payload = JSON.stringify({ type: 'cmd', clientMsgId, cmd });
    return new Promise<AckResult>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(clientMsgId);
        reject(new Error('ACK_TIMEOUT'));
      }, ACK_TIMEOUT_MS);
      this.pending.set(clientMsgId, { payload, resolve, reject, timeout });
      this.rawSend(payload);
    });
  }

  /** Sunucu saatiyle hizalanmış şimdiki zaman (ms). */
  serverNow(): number {
    return Date.now() + (this.clockOffset ?? 0);
  }

  get currentState(): SocketState {
    return this.state;
  }

  get currentReason(): SocketReason {
    return this.reason;
  }
}

interface PendingCommand {
  payload: string;
  resolve: (ack: AckResult) => void;
  reject: (error: Error) => void;
  timeout: number;
}
