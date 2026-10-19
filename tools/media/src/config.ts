import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
export const configDir =
  process.env.MOL_MEDIA_CONFIG_DIR ??
  join(
    process.env.APPDATA ?? process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
    'mol-media',
  );
export interface Config {
  server: string;
  cookie: string;
}
export async function loadConfig(): Promise<Config | undefined> {
  try {
    return JSON.parse(await readFile(join(configDir, 'session.json'), 'utf8')) as Config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error('Oturum ayarı okunamadı; pnpm media login çalıştırın.', { cause: error });
  }
}
export async function saveConfig(config: Config) {
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await chmod(configDir, 0o700);
  const temp = join(configDir, `session-${process.pid}.tmp`);
  try {
    await writeFile(temp, JSON.stringify(config), { mode: 0o600 });
    await chmod(temp, 0o600);
    await rename(temp, join(configDir, 'session.json'));
  } finally {
    await rm(temp, { force: true });
  }
}
