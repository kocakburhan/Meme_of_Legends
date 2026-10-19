import { parseArgs } from 'node:util';

export interface Options {
  command: 'add' | 'import' | 'login' | 'setup' | 'update';
  source?: string;
  server?: string;
  category?: string;
  description?: string;
  start?: number;
  end?: number;
  dryRun: boolean;
  report?: string;
}
export function timestamp(value: string): number {
  if (!/^\d+(?::[0-5]\d){0,2}(?:\.\d+)?$/.test(value))
    throw new Error('Geçersiz kesim zamanı: ' + value);
  return value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}
export function parseCli(args: string[]): Options {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      server: { type: 'string' },
      category: { type: 'string' },
      description: { type: 'string' },
      start: { type: 'string' },
      end: { type: 'string' },
      'dry-run': { type: 'boolean' },
      report: { type: 'string' },
    },
  });
  const command = positionals[0];
  if (!['add', 'import', 'login', 'setup', 'update'].includes(command ?? ''))
    throw new Error('Kullanım: pnpm media <setup|update|login|add|import> [kaynak] [seçenekler]');
  if (positionals.length !== (command === 'add' || command === 'import' ? 2 : 1))
    throw new Error('Komut için kaynak sayısı yanlış.');
  if (command !== 'add' && (values.start !== undefined || values.end !== undefined))
    throw new Error('Kesim yalnız add komutunda kullanılabilir.');
  const start = values.start === undefined ? undefined : timestamp(values.start);
  const end = values.end === undefined ? undefined : timestamp(values.end);
  if (end !== undefined && (end <= (start ?? 0) || end - (start ?? 0) > 25))
    throw new Error('Kesim aralığı pozitif ve en fazla 25 sn olmalı.');
  return {
    command: command as Options['command'],
    source: positionals[1],
    server: values.server,
    category: values.category,
    description: values.description,
    start,
    end,
    dryRun: values['dry-run'] ?? false,
    report: values.report,
  };
}
export function canonicalize(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Geçersiz kaynak bağlantısı.');
  const host = url.hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/^mobile\./, '')
    .replace(/^m\./, '');
  if (['youtube.com', 'youtu.be'].includes(host)) {
    const id =
      host === 'youtu.be'
        ? url.pathname.split('/')[1]
        : (url.searchParams.get('v') ??
          /^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[1]);
    if (!id || !/^[\w-]+$/.test(id)) throw new Error('YouTube video kimliği bulunamadı.');
    return `https://www.youtube.com/watch?v=${id}`;
  }
  if (['x.com', 'twitter.com'].includes(host)) {
    const id = /\/status\/(\d+)/.exec(url.pathname)?.[1];
    if (!id) throw new Error('X gönderi bağlantısı gerekli.');
    return `https://x.com/i/status/${id}`;
  }
  if (host === 'instagram.com') {
    const match = /^\/(p|reel|reels|tv)\/([\w-]+)/.exec(url.pathname);
    if (!match) throw new Error('Instagram gönderi bağlantısı gerekli.');
    return `https://www.instagram.com/${match[1] === 'reels' ? 'reel' : match[1]}/${match[2]}/`;
  }
  throw new Error('Desteklenmeyen site; YouTube, X veya Instagram bağlantısı kullanın.');
}
export function downloadError(message: string): string {
  if (/private|protected|not authorized/i.test(message))
    return 'İçerik gizli; herkese açık bir içerik kullanın.';
  if (
    /sign in|log.?in|cookies|authentication|age.restricted|confirm you.re not a bot/i.test(message)
  )
    return 'İçerik giriş veya platform doğrulaması gerektiriyor.';
  if (/deleted|removed|not found|unavailable|does not exist|404/i.test(message))
    return 'İçerik silinmiş veya artık erişilemiyor.';
  if (/unsupported url|no suitable extractor/i.test(message))
    return 'Desteklenmeyen site veya gönderi biçimi.';
  if (/network|timed? ?out|connection|resolve|HTTP Error|fetch failed|ENOTFOUND/i.test(message))
    return 'Ağ hatası; bağlantıyı ve platform erişimini kontrol edin.';
  return 'İndirme başarısız; platform biçimi değişmiş olabilir. pnpm media update çalıştırın.';
}
export interface ItemResult {
  source: string;
  result: 'uploaded' | 'duplicate' | 'dry-run' | 'error';
  memeId?: string;
  error?: string;
}
export function summarize(items: ItemResult[]) {
  return {
    total: items.length,
    uploaded: items.filter((i) => i.result === 'uploaded').length,
    duplicate: items.filter((i) => i.result === 'duplicate').length,
    dryRun: items.filter((i) => i.result === 'dry-run').length,
    failed: items.filter((i) => i.result === 'error').length,
  };
}
export async function concurrent<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(2, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index]!);
      }
    }),
  );
  return results;
}
