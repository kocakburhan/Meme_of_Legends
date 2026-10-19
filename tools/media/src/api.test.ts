import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Api } from './api.js';
import { execute, processItem } from './workflow.js';
import { parseCli } from './core.js';
let server: Server;
let api: Api;
let dir: string;
let status = 201;
let checks = 0;
let uploads = 0;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mol-api-test-'));
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/auth/admin/login') {
      expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual({
        username: 'admin',
        password: 'secret',
      });
      res.setHeader('set-cookie', 'mol_admin=test; HttpOnly; Path=/');
      res.end('{}');
      return;
    }
    expect(req.headers.cookie).toBe('mol_admin=test');
    if (req.url?.startsWith('/api/admin/memes/check?')) {
      checks++;
      res.end(JSON.stringify({ existingId: 'existing' }));
      return;
    }
    if (req.url === '/api/admin/categories') {
      res.end(JSON.stringify({ categories: [{ id: 'cat', name: 'Komik' }] }));
      return;
    }
    if (req.url === '/api/admin/memes') {
      uploads++;
      const form = await new Response(Buffer.concat(chunks), {
        headers: { 'content-type': req.headers['content-type']! },
      }).formData();
      expect((form.get('file') as File).type).toBe('video/mp4');
      expect((form.get('cover') as File).type).toBe('image/jpeg');
      expect(JSON.parse(form.get('meta') as string)).toMatchObject({
        mediaType: 'video',
        durationMs: 1000,
        categoryId: 'cat',
        description: 'Açıklama',
      });
      res.statusCode = status;
      res.end(
        JSON.stringify(
          status === 201
            ? { meme: { id: 'new' } }
            : {
                error: {
                  code: status === 409 ? 'MEME_DUPLICATE' : 'MEDIA_INVALID',
                  existingId: 'existing',
                },
              },
        ),
      );
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('listen');
  api = new Api(`http://127.0.0.1:${address.port}`);
  await api.login('admin', 'secret');
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await rm(dir, { recursive: true, force: true });
});
it('kategori adını eşler, bilinmeyen ad için seçenekleri söyler', async () => {
  expect(await api.category('komik')).toBe('cat');
  await expect(api.category('başka')).rejects.toThrow('Mevcut kategoriler: Komik');
});
it('multipart yükler, 201/409/422 durumlarını işler', async () => {
  const file = join(dir, 'media.mp4');
  const cover = join(dir, 'cover.jpg');
  await writeFile(file, 'fake video');
  await writeFile(cover, 'fake cover');
  const media = { file, cover, mediaType: 'video' as const, mime: 'video/mp4', durationMs: 1000 };
  const meta = { categoryId: 'cat', description: 'Açıklama' };
  expect(await api.upload(media, meta)).toEqual({ duplicate: false, id: 'new' });
  status = 409;
  expect(await api.upload(media, meta)).toEqual({ duplicate: true, id: 'existing' });
  status = 422;
  await expect(api.upload(media, meta)).rejects.toThrow('MEDIA_INVALID');
  status = 201;
});
it('mükerrer kaynağı indirmeden atlar', async () => {
  const before = uploads;
  const result = await processItem(
    'https://youtu.be/abc?si=track',
    parseCli(['add', 'unused']),
    api,
  );
  expect(result).toMatchObject({ result: 'duplicate', memeId: 'existing' });
  expect(checks).toBe(1);
  expect(uploads).toBe(before);
});
it('toplu hataları ve mükerrerleri JSON raporuna yazar', async () => {
  const list = join(dir, 'links.txt');
  const report = join(dir, 'report.json');
  await writeFile(list, '# arşiv\nhttps://youtu.be/abc\nhttps://unsupported.test/a\n');
  expect(await execute(parseCli(['import', list, '--report', report]), api)).toBe(1);
  const body = JSON.parse(await readFile(report, 'utf8'));
  expect(body.summary).toMatchObject({ total: 2, duplicate: 1, failed: 1 });
  expect(body.items[1].error).toContain('Desteklenmeyen');
});
