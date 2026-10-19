import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chmod, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const exec = promisify(execFile);
const require = createRequire(import.meta.url);
export const cacheDir = join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'mol-media');
export async function run(binary: string, args: string[]) {
  return exec(binary, args, { timeout: 180_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
}
export async function binary(name: 'ffmpeg' | 'ffprobe' | 'yt-dlp'): Promise<string> {
  const override = process.env[name === 'yt-dlp' ? 'MOL_YTDLP' : `MOL_${name.toUpperCase()}`];
  if (override) return override;
  try {
    await run(name, [name === 'yt-dlp' ? '--version' : '-version']);
    return name;
  } catch {
    /* Use bundled/user binary. */
  }
  if (name === 'yt-dlp') {
    const path = join(cacheDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    try {
      await run(path, ['--version']);
      return path;
    } catch {
      throw new Error('yt-dlp bulunamadı. Önce pnpm media setup çalıştırın.');
    }
  }
  const path = (
    require(name === 'ffmpeg' ? '@ffmpeg-installer/ffmpeg' : '@ffprobe-installer/ffprobe') as {
      path: string;
    }
  ).path;
  // pnpm may skip the optional package postinstall that sets executable bits.
  if (process.platform !== 'win32') await chmod(path, 0o755);
  return path;
}
export async function setup() {
  const asset =
    process.platform === 'win32'
      ? process.arch === 'arm64'
        ? 'yt-dlp_arm64.exe'
        : 'yt-dlp.exe'
      : process.platform === 'darwin'
        ? 'yt-dlp_macos'
        : process.platform === 'linux'
          ? process.arch === 'arm64'
            ? 'yt-dlp_linux_aarch64'
            : process.arch === 'x64'
              ? 'yt-dlp_linux'
              : undefined
          : undefined;
  if (!asset)
    throw new Error('Bu platformda yt-dlp sistemden kurulmalı; MOL_YTDLP yolunu belirtin.');
  const base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/';
  const [response, checksums] = await Promise.all([
    fetch(base + asset, { signal: AbortSignal.timeout(120_000) }),
    fetch(base + 'SHA2-256SUMS', { signal: AbortSignal.timeout(120_000) }),
  ]);
  if (!response.ok || !checksums.ok)
    throw new Error('yt-dlp indirilemedi; ağ bağlantısını kontrol edin.');
  const data = Buffer.from(await response.arrayBuffer());
  const expected = (await checksums.text())
    .split('\n')
    .find((line) => line.trim().endsWith(' ' + asset))
    ?.split(/\s+/)[0];
  if (!expected || createHash('sha256').update(data).digest('hex') !== expected)
    throw new Error('yt-dlp sağlama toplamı uyuşmuyor.');
  await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  const path = join(cacheDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  const temp = path + '.' + process.pid + '.tmp';
  try {
    await writeFile(temp, data, { mode: 0o700 });
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
  await run(await binary('ffmpeg'), ['-version']);
  await run(await binary('ffprobe'), ['-version']);
  console.log('Medya araçları hazır (sudo gerekmez).');
}
