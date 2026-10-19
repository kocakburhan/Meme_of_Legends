import { spawnSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Uçtan uca test öncesi yerel ortam hazırlığı:
 * 1. `apps/server/.dev.vars` yoksa rastgele TOKEN_SECRET ile oluşturulur.
 * 2. Yerel D1'e migration uygulanır.
 * 3. Admin hesabı, platform durumları (prompt) ve sistem meme'leri tohumlanır.
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
      (text, i) => `INSERT INTO prompts (id,owner_type,text,normalized_text,status,admin_blocked,created_at,updated_at)
        VALUES (${quote(`pr-e2e-${i}`)},'platform',${quote(text)},${quote(text.toLocaleLowerCase('tr'))},'active',0,${now},${now})
        ON CONFLICT(id) DO UPDATE SET status='active', admin_blocked=0, text=excluded.text;`,
    ),
    `INSERT INTO categories (id,name,sort_order,archived) VALUES ('cat-e2e-genel','Genel',0,0)
     ON CONFLICT(id) DO UPDATE SET archived=0, name='Genel';`,
    ...MEME_TITLES.map(
      (title, i) => `INSERT INTO memes (id,category_id,description,media_type,r2_key,status,created_at)
        VALUES (${quote(`m-e2e-${i}`)},'cat-e2e-genel',${quote(title)},${quote(i === 2 ? 'gif' : 'image')},${quote(`e2e/m-e2e-${i}.png`)},'active',${now})
        ON CONFLICT(id) DO UPDATE SET status='active', description=excluded.description, media_type=excluded.media_type;`,
    ),
  ].join('\n');

  const directory = await mkdtemp(join(tmpdir(), 'mol-e2e-'));
  const file = join(directory, 'seed.sql');
  await writeFile(file, sql, { mode: 0o600 });
  if (wrangler(['d1', 'execute', 'mol-db', '--local', '--file', file]) !== 0)
    throw new Error('Tohumlama (seed) başarısız.');
  console.log('e2e: yerel D1 tohumlandı (admin, durumlar, meme kütüphanesi).');
}

// Doğrudan çalıştırma: `pnpm --filter @mol/server exec tsx ../e2e/global-setup.ts`
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await globalSetup();
}
