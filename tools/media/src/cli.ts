import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import type { Key } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { Api } from './api.js';
import { binary, run, setup } from './binaries.js';
import { loadConfig, saveConfig } from './config.js';
import { parseCli } from './core.js';
import { execute } from './workflow.js';
async function passwordPrompt(): Promise<string> {
  if (!stdin.isTTY)
    throw new Error('Etkileşimli terminal yok; MOL_ADMIN_PASSWORD ortam değişkenini kullanın.');
  stdout.write('Admin şifresi: ');
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let password = '';
    const cleanup = () => {
      stdin.off('keypress', handler);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    const handler = (text: string | undefined, key: Key) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error('Giriş iptal edildi.'));
      } else if (key.name === 'return') {
        cleanup();
        resolve(password);
      } else if (key.name === 'backspace') password = [...password].slice(0, -1).join('');
      else if (text && !key.ctrl && !key.meta) password += text;
    };
    stdin.on('keypress', handler);
  });
}
async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.command === 'setup') {
    await setup();
    return;
  }
  if (options.command === 'update') {
    await run(await binary('yt-dlp'), ['-U']);
    console.log('yt-dlp güncellendi.');
    return;
  }
  const config = await loadConfig();
  const address =
    options.server ?? process.env.MOL_MEDIA_SERVER ?? config?.server ?? 'http://localhost:8787';
  new Api(address);
  const server = new URL(address).origin;
  const api = new Api(
    server,
    config && new URL(config.server).origin === server ? config.cookie : '',
  );
  if (options.command === 'login') {
    let username = process.env.MOL_ADMIN_USERNAME;
    if (!username) {
      if (!stdin.isTTY) throw new Error('MOL_ADMIN_USERNAME ve MOL_ADMIN_PASSWORD belirtin.');
      const rl = createInterface({ input: stdin, output: stdout });
      try {
        username = await rl.question('Admin kullanıcı adı: ');
      } finally {
        rl.close();
      }
    }
    const password = process.env.MOL_ADMIN_PASSWORD ?? (await passwordPrompt());
    await api.login(username, password);
    await saveConfig({ server, cookie: api.cookie });
    console.log('Admin oturumu kaydedildi.');
    return;
  }
  if (!options.dryRun && process.env.MOL_ADMIN_USERNAME && process.env.MOL_ADMIN_PASSWORD)
    await api.login(process.env.MOL_ADMIN_USERNAME, process.env.MOL_ADMIN_PASSWORD);
  process.exitCode = await execute(options, api);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
