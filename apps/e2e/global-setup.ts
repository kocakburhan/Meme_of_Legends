import { spawnSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

/**
 * Uçtan uca test öncesi yerel ortam hazırlığı:
 * 1. `apps/server/.dev.vars` yoksa rastgele TOKEN_SECRET ile oluşturulur.
 * 2. Yerel D1'e migration uygulanır.
 * 3. Admin hesabı, platform durumları (prompt) ve sistem meme'leri tohumlanır;
 *    meme dosyaları yerel R2'ye gerçek (küçük) dosyalar olarak yazılır —
 *    anahtarlar `memes/` önekiyledir, medya ucu yalnız bu öneki sunar.
 * Sunucu ve web Playwright `webServer` dizisiyle ayağa kalkar.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SERVER_DIR = join(ROOT, 'apps', 'server');

export const E2E_ADMIN = { username: 'e2e-admin', password: 'e2e-admin-password-123' };

function hashPassword(password: string): string {
  // apps/server/src/security.ts biçimi: pbkdf2-sha256$iter$salt$hash (base64url).
  const iterations = 100_000;
  const salt = randomBytes(16);
  const derived = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return `pbkdf2-sha256$${iterations}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function wrangler(args: string[]): number {
  const result = spawnSync('pnpm', ['--filter', '@mol/server', 'exec', 'wrangler', ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
  });
  return result.status ?? 1;
}

/* ------------------------- Küçük gerçek medya dosyaları ------------------------ */

const CRC_TABLE: number[] = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(
    crc32(Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)])),
    data.length + 8,
  );
  return out;
}

/** Damalı iki renkli küçük PNG: testte üretilir, depoda ikili dosya yok. */
export function makePng(size: number, rgb: [number, number, number]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 2; // gerçek renk (RGB)
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filtre: yok
    for (let x = 0; x < size; x++) {
      const offset = y * stride + 1 + x * 3;
      const light = ((x >> 2) + (y >> 2)) % 2 === 0;
      raw[offset] = light ? rgb[0] : 30;
      raw[offset + 1] = light ? rgb[1] : 24;
      raw[offset + 2] = light ? rgb[2] : 40;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

/** 1×1 GIF (GIF89a) — tek baytlık yer tutucu kare. */
const TINY_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64',
);

const PROMPT_TEXTS = [
  'Maaşın yattığı an',
  'Pazartesi sabahı uyanmak',
  'Toplantıda kamera kapatan adam',
  'Kahve soğuduktan sonraki hayat',
  'Şampiyonluk kutlaması yanlış anlaşıldı',
  'Sınavdan çıkan öğrencinin yüzü',
];

const MEME_TITLES = [
  'Maaş yattı ama kira da yattı',
  'Pazartesi yüzü',
  'Toplantı bitmeyen adam',
  'Kahve soğudu kahramanı',
  'Şampiyonluk kutlaması',
  'Sınavdan çıkan öğrenci',
];

const MEME_COLORS: [number, number, number][] = [
  [255, 210, 63],
  [255, 142, 127],
  [140, 233, 154],
  [127, 212, 255],
  [201, 160, 255],
  [245, 242, 234],
];

const MEME_SEEDS = MEME_TITLES.map((title, i) => ({
  id: `m-e2e-${i}`,
  title,
  // Üçüncü kayıt GIF olsun: kütüphane rozetleri ve görsel çeşitlilik için.
  mediaType: (i === 2 ? 'gif' : 'image') as 'gif' | 'image',
  r2Key: `memes/m-e2e-${i}/media.${i === 2 ? 'gif' : 'png'}`,
}));

export default async function globalSetup(): Promise<void> {
  const varsFile = join(SERVER_DIR, '.dev.vars');
  if (!existsSync(varsFile)) {
    await writeFile(varsFile, `TOKEN_SECRET=${randomBytes(32).toString('base64url')}\n`);
    console.log('e2e: .dev.vars oluşturuldu.');
  } else if (!readFileSync(varsFile, 'utf8').includes('TOKEN_SECRET=')) {
    throw new Error('apps/server/.dev.vars TOKEN_SECRET içermiyor.');
  }

  if (wrangler(['d1', 'migrations', 'apply', 'mol-db', '--local']) !== 0)
    throw new Error('D1 migration uygulanamadı.');

  const now = Date.now();
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
  const sql = [
    `INSERT INTO admin_account (id,username,password_hash,created_at) VALUES (1,${quote(E2E_ADMIN.username)},${quote(hashPassword(E2E_ADMIN.password))},${now})
     ON CONFLICT(id) DO UPDATE SET username=excluded.username, password_hash=excluded.password_hash;`,
    ...PROMPT_TEXTS.map(
      (
        text,
        i,
      ) => `INSERT INTO prompts (id,owner_type,text,normalized_text,status,admin_blocked,created_at,updated_at)
        VALUES (${quote(`pr-e2e-${i}`)},'platform',${quote(text)},${quote(text.toLocaleLowerCase('tr'))},'active',0,${now},${now})
        ON CONFLICT(id) DO UPDATE SET status='active', admin_blocked=0, text=excluded.text;`,
    ),
    `INSERT INTO categories (id,name,sort_order,archived) VALUES ('cat-e2e-genel','Genel',0,0)
     ON CONFLICT(id) DO UPDATE SET archived=0, name='Genel';`,
    ...MEME_SEEDS.map(
      (meme) => `INSERT INTO memes (id,category_id,description,media_type,r2_key,status,created_at)
        VALUES (${quote(meme.id)},'cat-e2e-genel',${quote(meme.title)},${quote(meme.mediaType)},${quote(meme.r2Key)},'active',${now})
        ON CONFLICT(id) DO UPDATE SET status='active', description=excluded.description, media_type=excluded.media_type, r2_key=excluded.r2_key;`,
    ),
  ].join('\n');

  const directory = await mkdtemp(join(tmpdir(), 'mol-e2e-'));
  const file = join(directory, 'seed.sql');
  await writeFile(file, sql, { mode: 0o600 });
  if (wrangler(['d1', 'execute', 'mol-db', '--local', '--file', file]) !== 0)
    throw new Error('Tohumlama (seed) başarısız.');
  console.log('e2e: yerel D1 tohumlandı (admin, durumlar, meme kütüphanesi).');

  // Meme dosyaları yerel R2'ye yazılır; anahtarlar memes/ önekiyle medya ucuna
  // çıkar (madde 7). Yükleme, dev sunucusunun varsayılan kalıcı dizinini kullanır.
  for (const meme of MEME_SEEDS) {
    const objectPath = `mol-media/${meme.r2Key}`;
    const localFile = join(directory, `${meme.id}.${meme.mediaType === 'gif' ? 'gif' : 'png'}`);
    await writeFile(
      localFile,
      meme.mediaType === 'gif'
        ? TINY_GIF
        : makePng(16, MEME_COLORS[Number(meme.id.slice(-1))] ?? MEME_COLORS[0]!),
    );
    const contentType = meme.mediaType === 'gif' ? 'image/gif' : 'image/png';
    if (
      wrangler([
        'r2',
        'object',
        'put',
        objectPath,
        '--local',
        '--file',
        localFile,
        '--content-type',
        contentType,
      ]) !== 0
    )
      throw new Error(`R2 nesnesi yazılamadı: ${objectPath}`);
  }
  console.log('e2e: meme dosyaları yerel R2’ye yazıldı (memes/ öneki).');
}

// Doğrudan çalıştırma: `pnpm --filter @mol/server exec tsx ../e2e/global-setup.ts`
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await globalSetup();
}
