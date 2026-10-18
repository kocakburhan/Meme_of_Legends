import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomSocket, roomSocketUrl } from './socket';

/**
 * `RoomSocket` birim testleri: sahte WebSocket ile ack eşleşmesi, yeniden
 * gönderme, üstel bekleme, `closed` terminali ve saat farkı hesabı.
 */

type Listener = (event: { type: string; data?: unknown; code?: number; reason?: string }) => void;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  readyState = 0;
  sent: string[] = [];
  listeners = new Map<string, Listener[]>();
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  addEventListener(type: string, listener: Listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  emit(type: string, event: { type: string; data?: unknown; code?: number; reason?: string } = { type }) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  send(payload: string) {
    this.sent.push(payload);
  }
  close(_code?: number, _reason?: string) {
    this.readyState = 3;
  }
  // Test yardımcıları
  open() {
    this.readyState = 1;
    this.emit('open');
  }
  receive(message: unknown) {
    this.emit('message', { type: 'message', data: JSON.stringify(message) });
  }
  drop() {
    this.emit('close', { type: 'close', code: 1006, reason: '' });
  }
}

let serverNow = 10_000;

function lastSocket(): FakeWebSocket {
  return FakeWebSocket.instances.at(-1)!;
}

describe('RoomSocket', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal('location', { protocol: 'http:', host: 'localhost:5173' });
    vi.spyOn(Math, 'random').mockReturnValue(0); // deterministik jitter
    FakeWebSocket.instances = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('komutu clientMsgId ile gönderir ve ack ile çözer', async () => {
    const socket = new RoomSocket({ code: 'KA7FT2', token: 't' });
    socket.connect();
    lastSocket().open();
    const promise = socket.sendCommand({ type: 'confirm' }, 'msg-1');
    expect(JSON.parse(lastSocket().sent.at(-1)!)).toEqual({
      type: 'cmd',
      clientMsgId: 'msg-1',
      cmd: { type: 'confirm' },
    });
    lastSocket().receive({ type: 'ack', clientMsgId: 'msg-1', ok: true });
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it('bağlantı kopunca uygulanmamış komutu aynı kimlikle yeniden gönderir', async () => {
    const socket = new RoomSocket({ code: 'KA7FT2', token: 't' });
    socket.connect();
    lastSocket().open();
    const promise = socket.sendCommand({ type: 'rate', submissionId: 's', score: 3 }, 'msg-2');
    const first = lastSocket();
    first.drop();
    await vi.advanceTimersByTimeAsync(600);
    const reconnected = lastSocket();
    expect(reconnected).not.toBe(first);
    reconnected.open();
    const resent = reconnected.sent.filter((m) => m.includes('"msg-2"'));
    expect(resent).toHaveLength(1);
    expect(JSON.parse(resent[0]!)).toMatchObject({ clientMsgId: 'msg-2' });
    reconnected.receive({ type: 'ack', clientMsgId: 'msg-2', ok: true });
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it('yeniden bağlanma üstel beklemeyi izler ve open ile sıfırlanır', async () => {
    const socket = new RoomSocket({ code: 'KA7FT2', token: 't' });
    socket.connect();
    expect(lastSocket()).toBeTruthy();
    lastSocket().drop();
    await vi.advanceTimersByTimeAsync(499);
    expect(FakeWebSocket.instances).toHaveLength(1); // henüz yeniden bağlanmadı
    await vi.advanceTimersByTimeAsync(2);
    expect(FakeWebSocket.instances).toHaveLength(2); // 500 ms sonra
    // open olmadan tekrar düşer: bekleme 1000 ms'e çıkar.
    lastSocket().drop();
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2);
    expect(FakeWebSocket.instances).toHaveLength(3);
    // open üsteli sıfırlar: sonraki bekleme yeniden 500 ms.
    lastSocket().open();
    lastSocket().drop();
    await vi.advanceTimersByTimeAsync(499);
    expect(FakeWebSocket.instances).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(2);
    expect(FakeWebSocket.instances).toHaveLength(4);
  });

  it('closed mesajı terminaldir; yeniden bağlanmaz', async () => {
    const states: string[] = [];
    const socket = new RoomSocket({
      code: 'KA7FT2',
      token: 't',
      handlers: { onState: (state) => states.push(state) },
    });
    socket.connect();
    lastSocket().open();
    lastSocket().receive({ type: 'closed', reason: 'kicked' });
    expect(states).toContain('closed');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await expect(socket.sendCommand({ type: 'confirm' })).rejects.toThrow('SOCKET_CLOSED');
  });

  it('ping/pong ile sunucu saat farkını hesaplar', () => {
    vi.setSystemTime(100_000);
    const socket = new RoomSocket({ code: 'KA7FT2', token: 't' });
    socket.connect();
    const ws = lastSocket();
    ws.open();
    // Sunucu istemciden tam 5000 ms ileride; gidiş-dönüş yok (rtt=0 yapay).
    vi.setSystemTime(100_000);
    ws.sent.length = 0;
    vi.setSystemTime(101_000);
    ws.sent.length = 0; // ping aralığını atla
    // ping gönder ve pong yakala
    vi.advanceTimersByTime(20_000);
    const ping = JSON.parse(ws.sent.find((m) => m.includes('"ping"'))!);
    // rtt = 0: hemen pong
    ws.receive({ type: 'pong', t: ping.t, serverNow: ping.t + 5000 });
    expect(socket.serverNow() - Date.now()).toBeCloseTo(5000, -1);
  });

  it('roomSocketUrl ws/wss seçer', () => {
    expect(roomSocketUrl('KA7FT2', 'abc')).toBe(
      'ws://localhost:5173/api/rooms/KA7FT2/ws?token=abc',
    );
  });
});
