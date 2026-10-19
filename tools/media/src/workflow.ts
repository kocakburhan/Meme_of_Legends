import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Api } from './api.js';
import { binary, run } from './binaries.js';
import { convert } from './convert.js';
import { canonicalize, concurrent, downloadError, summarize } from './core.js';
import type { ItemResult, Options } from './core.js';
export async function download(source: string, dir: string): Promise<string> {
  try {
    await run(await binary('yt-dlp'), [
      '--ignore-config',
      '--no-playlist',
      '--playlist-items',
      '1',
      '--no-progress',
      '--socket-timeout',
      '20',
      '--retries',
      '1',
      '--js-runtimes',
      'node',
      '--ffmpeg-location',
      await binary('ffmpeg'),
      '-f',
      'bv*[vcodec^=avc1]+ba[acodec^=mp4a]/b[vcodec^=avc1]/bv*[vcodec!^=av01]+ba/b',
      '--merge-output-format',
      'mkv',
      '-o',
      join(dir, 'download.%(ext)s'),
      '--',
      source,
    ]);
    const files = (await readdir(dir)).filter(
      (f) => f.startsWith('download.') && !/\.(part|ytdl|json)$/.test(f),
    );
    if (files.length !== 1) throw new Error('No suitable extractor: tek medya dosyası bulunamadı');
    return join(dir, files[0]!);
  } catch (error) {
    const detail = error as Error & { stderr?: string };
    if (detail.message.includes('pnpm media setup')) throw error;
    throw new Error(downloadError(detail.stderr ?? detail.message), { cause: error });
  }
}
export async function processItem(
  source: string,
  options: Options,
  api: Api,
  categoryId?: string,
): Promise<ItemResult> {
  let dir: string | undefined;
  try {
    const sourceUrl = /^https?:\/\//i.test(source) ? canonicalize(source) : undefined;
    // Dry runs intentionally work without an admin server/session.
    if (sourceUrl && !options.dryRun) {
      const id = await api.check(sourceUrl);
      if (id) return { source, result: 'duplicate', memeId: id };
    }
    dir = await mkdtemp(join(tmpdir(), 'mol-media-'));
    const input = sourceUrl ? await download(sourceUrl, dir) : resolve(source);
    const media = await convert(input, dir, options.start, options.end);
    if (options.dryRun) return { source, result: 'dry-run' };
    const result = await api.upload(media, {
      sourceUrl,
      categoryId,
      description: options.description,
    });
    return { source, result: result.duplicate ? 'duplicate' : 'uploaded', memeId: result.id };
  } catch (error) {
    return {
      source,
      result: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
export async function sources(input: string): Promise<string[]> {
  if ((await stat(input)).isDirectory()) {
    const entries = await readdir(input, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && /\.(mp4|mov|mkv|webm|avi|m4v|jpe?g|png|webp|gif)$/i.test(e.name))
      .map((e) => resolve(input, e.name))
      .sort();
  }
  return (await readFile(input, 'utf8'))
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
}
export async function execute(options: Options, api: Api) {
  const categoryId = await api.category(options.category);
  const inputs = options.command === 'import' ? await sources(options.source!) : [options.source!];
  const items = await concurrent(inputs, async (source) => {
    const item = await processItem(source, options, api, categoryId);
    console.log(
      `${item.result}: ${source}${item.memeId ? ' → ' + item.memeId : ''}${item.error ? ' → ' + item.error : ''}`,
    );
    return item;
  });
  const summary = summarize(items);
  if (options.command === 'import') {
    const path = resolve(options.report ?? `mol-media-report-${Date.now()}.json`);
    await writeFile(
      path,
      JSON.stringify({ createdAt: new Date().toISOString(), summary, items }, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    console.log('JSON raporu: ' + path);
  }
  console.log(
    `Toplam ${summary.total}; yüklendi ${summary.uploaded}; mükerrer ${summary.duplicate}; kuru deneme ${summary.dryRun}; hata ${summary.failed}.`,
  );
  return summary.failed === 0 ? 0 : 1;
}
