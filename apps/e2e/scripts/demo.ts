import { spawn, type ChildProcess } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import globalSetup from '../global-setup';
import { createDisplayPairCode, createLobby, SERVER, WEB } from '../helpers/driver';

/**
 * Yerel deneme: sunucu + web'i açar, örnek veriyi tohumlar, bir lobi kurar ve
 * yönetici konsolu (M4) gelene kadar oyunu terminalden yönetir.
 *   pnpm demo [--mode league|elimination|hybrid] [--rounds 2]
 */

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const mode = arg('mode', 'league') as 'league' | 'elimination' | 'hybrid';
const rounds = Number(arg('rounds', '2'));

const lanIp =
  Object.values(networkInterfaces())
    .flat()
    .find((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('172.'))
    ?.address ?? 'localhost';
const lanWeb = WEB.replace('localhost', lanIp);

const children: ChildProcess[] = [];
function run(command: string, cmdArgs: string[]) {
  const child = spawn(command, cmdArgs, { cwd: ROOT, stdio: 'ignore', detached: true });
  children.push(child);
}
function shutdown(code = 0): never {
  for (const child of children)
    try {
      process.kill(-child.pid!, 'SIGTERM');
    } catch {
      /* Already gone. */
    }
  process.exit(code);
}
process.on('SIGINT', () => shutdown());

async function waitFor(url: string) {
  for (let i = 0; i < 180; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* Not up yet. */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${url} açılmadı`);
}

await globalSetup();
console.log('Sunucu ve web açılıyor…');
run('pnpm', ['--filter', '@mol/server', 'dev', '--port', '8787']);
run('pnpm', ['--filter', '@mol/web', 'dev', '--port', '5173', '--strictPort', '--host']);
await waitFor(`${SERVER}/health`);
await waitFor(`${WEB}/`);

const lobby = await createLobby({ mode, leagueRounds: rounds });
const pair = await createDisplayPairCode(lobby.manager);
const announced = new Set<string>();
lobby.manager.onMessage((m) => {
  if (m.type === 'view' && m.shell)
    for (const t of m.shell.pendingTakeovers)
      if (!announced.has(t.requestId)) {
        announced.add(t.requestId);
        console.log(`\n> "${t.nickname}" yeni cihazdan devam etmek istiyor. Onaylamak için: o`);
      }
});

console.log(`
──────────────────────────────────────────────
 ODA KODU:        ${lobby.code}   (mod: ${mode}, ${rounds} tur)
 Ortak ekran:     ${lanWeb}/ekran   → eşleştirme kodu: ${pair.code}
 Telefonlar:      ${lanWeb}   (aynı Wi-Fi) ya da ekrandaki QR
 Bu bilgisayarda: ${WEB}
──────────────────────────────────────────────
 Komutlar: b = oyunu başlat · e = yeni ekran kodu · o = cihaz devirlerini onayla
           r = rövanş · d = durum · q = çıkış
`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
for (;;) {
  const input = (await rl.question('> ')).trim().toLowerCase();
  const view = lobby.manager.latestView();
  if (input === 'q') break;
  if (input === 'b') {
    const ack = await lobby.manager.command({ type: 'start' });
    console.log(ack.ok ? 'Oyun başladı.' : `Başlatılamadı: ${ack.reason}`);
  } else if (input === 'e') {
    const ack = await lobby.manager.shell({ kind: 'createDisplayPairCode' });
    const code = lobby.manager.latestView()?.shell?.displayPairCode?.code;
    console.log(ack.ok ? `Yeni ekran kodu: ${code ?? '(birazdan durum ile bak: d)'}` : ack.reason);
  } else if (input === 'o') {
    const pending = view?.shell?.pendingTakeovers ?? [];
    if (!pending.length) console.log('Bekleyen devir yok.');
    for (const t of pending) {
      const ack = await lobby.manager.shell({ kind: 'approveTakeover', requestId: t.requestId });
      console.log(`${t.nickname}: ${ack.ok ? 'onaylandı' : ack.reason}`);
    }
  } else if (input === 'r') {
    const ack = await lobby.manager.shell({ kind: 'rematch' });
    console.log(ack.ok ? 'Rövanş lobisi açıldı; başlatmak için: b' : `Rövanş açılamadı: ${ack.reason}`);
  } else if (input === 'd') {
    const v = view?.view;
    const people = Object.values(v?.participants ?? {});
    console.log(
      `Durum: ${v?.status} / aşama: ${v?.phase.kind} · katılımcı: ${people.length} · ekran bağlı: ${view?.shell?.displayConnected ? 'evet' : 'hayır'} · ekran kodu: ${view?.shell?.displayPairCode?.code ?? '-'}`,
    );
  } else if (input) console.log('Bilinmeyen komut. b, e, o, r, d, q');
}
rl.close();
lobby.close();
shutdown();
