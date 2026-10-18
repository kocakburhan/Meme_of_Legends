import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { hashPassword } from '../src/security';
import { usernameSchema, passwordSchema } from '../src/auth';

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--remote')) throw new Error('Kullanım: admin:create [--remote]');
const remote = args.includes('--remote');
let muted = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});
const rl = createInterface({
  input: process.stdin,
  output,
  terminal: Boolean(process.stdin.isTTY),
});
let directory: string | undefined;
try {
  const username = usernameSchema.parse(
    process.env.MOL_ADMIN_USERNAME ?? (await rl.question('Kullanıcı adı: ')),
  );
  process.stdout.write('Şifre (en az 12 karakter): ');
  muted = true;
  const password = passwordSchema.parse(process.env.MOL_ADMIN_PASSWORD ?? (await rl.question('')));
  muted = false;
  process.stdout.write('\n');
  const hash = await hashPassword(password);
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
  // Plain INSERT deliberately refuses to replace an existing single admin account.
  const query = `INSERT INTO admin_account (id,username,password_hash,created_at) VALUES (1,${quote(username)},${quote(hash)},${Date.now()});`;
  directory = await mkdtemp(join(tmpdir(), 'mol-admin-'));
  const file = join(directory, 'create.sql');
  await writeFile(file, query, { mode: 0o600 });
  const result = spawnSync(
    'wrangler',
    ['d1', 'execute', 'mol-db', remote ? '--remote' : '--local', '--file', file],
    { stdio: 'inherit', shell: false, cwd: fileURLToPath(new URL('..', import.meta.url)) },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error('Admin oluşturulamadı. Migration ve mevcut hesabı kontrol edin.');
  console.log(`Admin oluşturuldu (${remote ? 'uzak' : 'yerel'} mol-db).`);
} finally {
  rl.close();
  if (directory) await rm(directory, { recursive: true, force: true });
}
