import {
  adminActionsResponseSchema,
  adminBusinessCreatedResponseSchema,
  adminBusinessesResponseSchema,
  adminBusinessResponseSchema,
  adminCategoriesResponseSchema,
  adminCategoryResponseSchema,
  adminCategorySchema,
  adminErrorsResponseSchema,
  adminImpersonateResponseSchema,
  adminMemeResponseSchema,
  adminMemesResponseSchema,
  adminOkResponseSchema,
  adminPasswordResponseSchema,
  adminPromptHealthResponseSchema,
  adminPromptResponseSchema,
  adminPromptSchema,
  adminPromptsResponseSchema,
  adminSessionResponseSchema,
  adminSessionsResponseSchema,
  adminUsageResponseSchema,
} from '@mol/shared';
import type { AdminBusiness, AdminSession, AdminUsage } from '@mol/shared';
import { z } from 'zod';
import { request } from './http';

/**
 * Admin API istemcisi (docs/contracts/admin-api.md): tüm yanıtlar `@mol/shared`
 * admin şemalarıyla doğrulanır. Kimlik HttpOnly `mol_admin_session` çereziyle
 * taşınır; oturum düşünce istekler 401 döner, sayfalar `?next=` ile girişe
 * yönlenir.
 */

export type { AdminBusiness, AdminSession, AdminUsage };

export type AdminActiveFilter = 'true' | 'false' | 'all';

export type AdminSessionStatusFilter =
  | 'all'
  | 'active'
  | 'past'
  | 'lobby'
  | 'running'
  | 'paused'
  | 'finished'
  | 'cancelled'
  | 'terminated';

export type AdminPromptStatusFilter = 'active' | 'archived' | 'all';
export type AdminPromptBlockFilter = 'true' | 'false' | 'all';
export type AdminMemeStatusFilter = 'all' | 'untagged' | 'active' | 'archived';

/** Oturum detayı (rapor, denetim ve müdahale kayıtlarıyla). */
export type AdminSessionDetail = z.infer<typeof adminSessionResponseSchema>;
/** İşletme bazında kullanım satırı (M5c-3). */
export type AdminUsageRow = z.infer<typeof adminUsageResponseSchema>['businesses'][number];
/** Sistem hata kaydı satırı. */
export type AdminError = z.infer<typeof adminErrorsResponseSchema>['errors'][number];
/** Admin işlem kaydı satırı. */
export type AdminAction = z.infer<typeof adminActionsResponseSchema>['actions'][number];

/** Kategori kaydı (@mol/shared şemasından). */
export type AdminCategory = z.infer<typeof adminCategorySchema>;
/** Platform ya da işletme durum kaydı (@mol/shared şemasından). */
export type AdminPrompt = z.infer<typeof adminPromptSchema>;

export function loginAdmin(input: { username: string; password: string }): Promise<{ ok: true }> {
  return request('/api/auth/admin/login', adminOkResponseSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function logoutAdmin(): Promise<{ ok: true }> {
  return request('/api/auth/admin/logout', adminOkResponseSchema, { method: 'POST' });
}

/** İşletme listesi; arama ad+kullanıcı adında Türkçe normalize eşleşir. */
export function listAdminBusinesses(
  opts: { q?: string; active?: AdminActiveFilter } = {},
): Promise<z.infer<typeof adminBusinessesResponseSchema>> {
  const params = new URLSearchParams({ q: opts.q ?? '', active: opts.active ?? 'all' });
  return request(`/api/admin/businesses?${params.toString()}`, adminBusinessesResponseSchema);
}

/** Kısa formla işletme açar; yanıt giriş bilgisi özetini taşır. */
export function createAdminBusiness(input: {
  name: string;
  username: string;
  credits: number;
  password: string;
}): Promise<z.infer<typeof adminBusinessCreatedResponseSchema>> {
  return request('/api/admin/businesses', adminBusinessCreatedResponseSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Tek işletme + kullanım özeti. */
export function getAdminBusiness(id: string): Promise<z.infer<typeof adminBusinessResponseSchema>> {
  return request(`/api/admin/businesses/${encodeURIComponent(id)}`, adminBusinessResponseSchema);
}

/** Hak/imtiyaz güncellemeleri; yanıt güncel işletmeyi taşır. */
export function updateAdminBusiness(
  id: string,
  patch: {
    creditsDelta?: number;
    unlimitedCredits?: boolean;
    active?: boolean;
    concurrentSessionLimit?: number;
    lobbyLifetimeHours?: number;
  },
): Promise<z.infer<typeof adminBusinessResponseSchema>> {
  return request(`/api/admin/businesses/${encodeURIComponent(id)}`, adminBusinessResponseSchema, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** Şifre sıfırlar; yeni geçici şifreyi döner (girişler iptal edilir). */
export function resetAdminBusinessPassword(id: string): Promise<{ temporaryPassword: string }> {
  return request(
    `/api/admin/businesses/${encodeURIComponent(id)}/password`,
    adminPasswordResponseSchema,
    // Gövde boş olsa da JSON istenir (sözleşme: `{ password? }`).
    { method: 'POST', body: JSON.stringify({}) },
  );
}

/** Adına giriş: işletme oturumu çerezi + `loginUrl` döner; admin çerezine dokunmaz. */
export function impersonateAdminBusiness(
  id: string,
): Promise<z.infer<typeof adminImpersonateResponseSchema>> {
  return request(
    `/api/admin/businesses/${encodeURIComponent(id)}/impersonate`,
    adminImpersonateResponseSchema,
    { method: 'POST' },
  );
}

/** Oturum listesi (imleçli); tarih sınırları oluşturulma zamanıdır (epoch ms). */
export function listAdminSessions(
  opts: {
    businessId?: string;
    status?: AdminSessionStatusFilter;
    from?: number;
    to?: number;
    cursor?: string;
    limit?: number;
  } = {},
): Promise<z.infer<typeof adminSessionsResponseSchema>> {
  const params = new URLSearchParams({ status: opts.status ?? 'all' });
  if (opts.businessId) params.set('businessId', opts.businessId);
  if (opts.from !== undefined) params.set('from', String(opts.from));
  if (opts.to !== undefined) params.set('to', String(opts.to));
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit) params.set('limit', String(opts.limit));
  return request(`/api/admin/sessions?${params.toString()}`, adminSessionsResponseSchema);
}

/** Tek oturum: rapor, denetim kaydı, admin müdahaleleri ve hatalar. */
export function getAdminSession(id: string): Promise<AdminSessionDetail> {
  return request(
    `/api/admin/sessions/${encodeURIComponent(id)}`,
    adminSessionResponseSchema,
  );
}

/** Aktif oturumu DO üzerinden sonlandırır (motorun mevcut endGame komutu). */
export function terminateAdminSession(id: string): Promise<{ ok: true }> {
  return request(
    `/api/admin/sessions/${encodeURIComponent(id)}/terminate`,
    adminOkResponseSchema,
    { method: 'POST' },
  );
}

/** Oturumun gerçekten harcanmış hakkını bir kez iade eder. */
export function refundAdminSession(id: string): Promise<{ ok: true }> {
  return request(
    `/api/admin/sessions/${encodeURIComponent(id)}/refund`,
    adminOkResponseSchema,
    { method: 'POST' },
  );
}

/** İşletme bazında kullanım özetleri (tüm işletmeler). */
export function getAdminUsage(): Promise<z.infer<typeof adminUsageResponseSchema>> {
  return request('/api/admin/usage', adminUsageResponseSchema);
}

/** Admin işlem kaydı (imleçli; hedef ve işlem adıyla filtrelenebilir). */
export function listAdminActions(
  opts: {
    targetId?: string;
    action?: string;
    cursor?: string;
    limit?: number;
  } = {},
): Promise<z.infer<typeof adminActionsResponseSchema>> {
  const params = new URLSearchParams();
  if (opts.targetId) params.set('targetId', opts.targetId);
  if (opts.action) params.set('action', opts.action);
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit) params.set('limit', String(opts.limit));
  return request(`/api/admin/actions?${params.toString()}`, adminActionsResponseSchema);
}

/** Aktif platform durumu sayısı + azlık eşiği (genel bakış uyarısı). */
export function getPromptHealth(): Promise<z.infer<typeof adminPromptHealthResponseSchema>> {
  return request('/api/admin/prompts/health', adminPromptHealthResponseSchema);
}

/* ------------------- İçerik: kategoriler ve durumlar (M5c-2) ------------------- */

/** Kategori listesi (arşivliler dahil; `sortOrder,id` artan). */
export function listAdminCategories(): Promise<z.infer<typeof adminCategoriesResponseSchema>> {
  return request('/api/admin/categories', adminCategoriesResponseSchema);
}

/** Kategori ekler; sıra verilmezse sona koyacak `sortOrder` sayfa tarafından seçilir. */
export function createAdminCategory(input: {
  name: string;
  sortOrder?: number;
}): Promise<z.infer<typeof adminCategoryResponseSchema>> {
  return request('/api/admin/categories', adminCategoryResponseSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Yeniden adlandırma, sıralama ve arşiv/geri al; her satır ayrı güncellenir. */
export function updateAdminCategory(
  id: string,
  patch: { name?: string; sortOrder?: number; archived?: boolean },
): Promise<z.infer<typeof adminCategoryResponseSchema>> {
  return request(`/api/admin/categories/${encodeURIComponent(id)}`, adminCategoryResponseSchema, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** Platform durum listesi (imleçli; aramada Türkçe normalize eşleşme). */
export function listAdminPrompts(
  opts: {
    q?: string;
    status?: AdminPromptStatusFilter;
    cursor?: string;
    limit?: number;
  } = {},
): Promise<z.infer<typeof adminPromptsResponseSchema>> {
  const params = new URLSearchParams({ q: opts.q ?? '', status: opts.status ?? 'all' });
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit) params.set('limit', String(opts.limit));
  return request(`/api/admin/prompts?${params.toString()}`, adminPromptsResponseSchema);
}

/** Platform durumu ekler; tekrar 409 PROMPT_DUPLICATE + existingId döner. */
export function createAdminPrompt(text: string): Promise<z.infer<typeof adminPromptResponseSchema>> {
  return request('/api/admin/prompts', adminPromptResponseSchema, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

/** Platform durumunu düzenler ya da arşivler / yeniden etkinleştirir. */
export function updateAdminPrompt(
  id: string,
  patch: { text?: string; status?: 'active' | 'archived' },
): Promise<z.infer<typeof adminPromptResponseSchema>> {
  return request(`/api/admin/prompts/${encodeURIComponent(id)}`, adminPromptResponseSchema, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** İşletme durumlarının platform denetim listesi (imleçli). */
export function listAdminBusinessPrompts(
  opts: {
    businessId?: string;
    q?: string;
    blocked?: AdminPromptBlockFilter;
    cursor?: string;
    limit?: number;
  } = {},
): Promise<z.infer<typeof adminPromptsResponseSchema>> {
  const params = new URLSearchParams({ q: opts.q ?? '', blocked: opts.blocked ?? 'all' });
  if (opts.businessId) params.set('businessId', opts.businessId);
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit) params.set('limit', String(opts.limit));
  return request(`/api/admin/business-prompts?${params.toString()}`, adminPromptsResponseSchema);
}

/** İşletme durumunu engeller / engeli kaldırır; metin düzenlenemez. */
export function blockAdminBusinessPrompt(
  id: string,
  adminBlocked: boolean,
): Promise<z.infer<typeof adminPromptResponseSchema>> {
  return request(
    `/api/admin/business-prompts/${encodeURIComponent(id)}`,
    adminPromptResponseSchema,
    { method: 'PATCH', body: JSON.stringify({ adminBlocked }) },
  );
}

/* ------------------------ İçerik: meme kütüphanesi (M5c-2) ------------------------ */

/** Sistem meme listesi (imleçli); arama açıklamada, kategori/durum filtreli. */
export function listAdminMemes(
  opts: {
    q?: string;
    categoryId?: string;
    status?: AdminMemeStatusFilter;
    order?: 'newest' | 'oldest';
    cursor?: string;
    limit?: number;
  } = {},
): Promise<z.infer<typeof adminMemesResponseSchema>> {
  const params = new URLSearchParams({
    q: opts.q ?? '',
    status: opts.status ?? 'all',
    order: opts.order ?? 'newest',
  });
  if (opts.categoryId) params.set('categoryId', opts.categoryId);
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit) params.set('limit', String(opts.limit));
  return request(`/api/admin/memes?${params.toString()}`, adminMemesResponseSchema);
}

/** Kategori/açıklama etiketi ve durum güncellemesi (422 MEME_TAGS_REQUIRED olabilir). */
export function updateAdminMeme(
  id: string,
  patch: { categoryId?: string | null; description?: string; status?: 'untagged' | 'active' | 'archived' },
): Promise<z.infer<typeof adminMemeResponseSchema>> {
  return request(`/api/admin/memes/${encodeURIComponent(id)}`, adminMemeResponseSchema, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/**
 * Etiketlenmemiş meme kuyruğu. Sunucu sayı vermez; genel bakış en fazla 100
 * kayıt çeker, taşarsa "100+" gösterir.
 */
export function listUntaggedMemes(): Promise<z.infer<typeof adminMemesResponseSchema>> {
  return listAdminMemes({ status: 'untagged', order: 'oldest', limit: 100 });
}

/** Sistem hata kayıtları (imleçli; oturum/kaynak/kod ile filtrelenebilir). */
export function listAdminErrors(
  opts: {
    sessionId?: string;
    source?: string;
    code?: string;
    limit?: number;
    cursor?: string;
  } = {},
): Promise<z.infer<typeof adminErrorsResponseSchema>> {
  const params = new URLSearchParams();
  if (opts.sessionId) params.set('sessionId', opts.sessionId);
  if (opts.source) params.set('source', opts.source);
  if (opts.code) params.set('code', opts.code);
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.cursor) params.set('cursor', opts.cursor);
  return request(`/api/admin/errors?${params.toString()}`, adminErrorsResponseSchema);
}
