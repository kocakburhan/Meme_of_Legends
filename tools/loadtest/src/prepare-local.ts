import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const root = new URL('../../../', import.meta.url);
const vars = new URL('apps/server/.dev.vars', root);
if (!existsSync(vars))
  writeFileSync(vars, `TOKEN_SECRET=${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
function run(args: string[]) {
  const result = spawnSync('pnpm', ['--filter', '@mol/server', ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(['db:migrate']);
run([
  'exec',
  'wrangler',
  'd1',
  'execute',
  'mol-db',
  '--local',
  '--command',
  "INSERT OR IGNORE INTO prompts (id,owner_type,text,normalized_text,created_at,updated_at) VALUES ('loadtest-prompt','platform','Toplantı yine uzayınca','toplantı yine uzayınca',0,0)",
]);
run(['admin:create']);
