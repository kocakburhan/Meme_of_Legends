import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { Converted } from './convert.js';
export class Api {
  constructor(
    readonly server: string,
    public cookie = '',
  ) {
    const url = new URL(server);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error('Sunucu adresi yalnız http(s) kök adresi olmalı.');
  }
  async request(path: string, init: RequestInit = {}) {
    const response = await fetch(new URL(path, this.server), {
      ...init,
      headers: { ...init.headers, ...(this.cookie ? { cookie: this.cookie } : {}) },
      redirect: 'error',
      signal: AbortSignal.timeout(120_000),
    });
    if (response.status === 401 || response.status === 403)
      throw new Error('Admin oturumu geçersiz; pnpm media login çalıştırın.');
    return response;
  }
  async login(username: string, password: string): Promise<string> {
    const response = await this.request('/api/auth/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) throw new Error('Admin girişi başarısız.');
    const cookies = response.headers.getSetCookie();
    this.cookie = cookies.map((c) => c.split(';')[0]).join('; ');
    if (!this.cookie) throw new Error('Sunucu oturum çerezi döndürmedi.');
    return this.cookie;
  }
  async check(sourceUrl: string): Promise<string | null> {
    const response = await this.request(
      '/api/admin/memes/check?sourceUrl=' + encodeURIComponent(sourceUrl),
    );
    if (!response.ok) throw new Error(`Mükerrer kontrolü başarısız (HTTP ${response.status}).`);
    const body = (await response.json()) as { existingId: string | null };
    if (body.existingId !== null && typeof body.existingId !== 'string')
      throw new Error('Geçersiz mükerrer kontrol yanıtı.');
    return body.existingId;
  }
  async category(name?: string): Promise<string | undefined> {
    if (!name) return undefined;
    const response = await this.request('/api/admin/categories');
    if (!response.ok) throw new Error(`Kategori listesi alınamadı (HTTP ${response.status}).`);
    const body = (await response.json()) as {
      categories: { id: string; name: string; archivedAt?: number | null; status?: string }[];
    };
    const categories = body.categories.filter((c) => !c.archivedAt && c.status !== 'archived');
    const found = categories.find(
      (c) => c.name.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'),
    );
    if (!found)
      throw new Error(
        `Kategori bulunamadı: ${name}. Mevcut kategoriler: ${categories.map((c) => c.name).join(', ') || '(yok)'}`,
      );
    return found.id;
  }
  async upload(
    media: Converted,
    meta: { sourceUrl?: string; categoryId?: string; description?: string },
  ) {
    const form = new FormData();
    form.set(
      'file',
      new Blob([await readFile(media.file)], { type: media.mime }),
      basename(media.file),
    );
    if (media.cover)
      form.set(
        'cover',
        new Blob([await readFile(media.cover)], { type: 'image/jpeg' }),
        basename(media.cover),
      );
    form.set(
      'meta',
      JSON.stringify({ mediaType: media.mediaType, durationMs: media.durationMs, ...meta }),
    );
    const response = await this.request('/api/admin/memes', { method: 'POST', body: form });
    if (response.status === 409) {
      const body = (await response.json()) as { error: { code: string; existingId: string } };
      if (body.error.code !== 'MEME_DUPLICATE' || !body.error.existingId)
        throw new Error('Geçersiz mükerrer yükleme yanıtı.');
      return { duplicate: true, id: body.error.existingId };
    }
    if (response.status === 422)
      throw new Error('MEDIA_INVALID: Sunucu medya türünü, boyutunu veya süresini reddetti.');
    if (response.status !== 201) throw new Error(`Yükleme başarısız (HTTP ${response.status}).`);
    const body = (await response.json()) as { meme: { id: string } };
    if (!body.meme?.id) throw new Error('Sunucu meme kimliği döndürmedi.');
    return { duplicate: false, id: body.meme.id };
  }
}
