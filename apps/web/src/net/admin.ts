import {
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
  adminSessionsResponseSchema,
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

/** Oturum listesi (imleçli); detay sayfası M5c-3'te gelir. */
export function listAdminSessions(
  opts: {
    businessId?: string;
    status?: AdminSessionStatusFilter;
    cursor?: string;
    limit?: number;
  } = {},
): Promise<z.infer<typeof adminSessionsResponseSchema>> {
  const params = new URLSearchParams({ status: opts.status ?? 'all' });
  if (opts.businessId) params.set('businessId', opts.businessId);
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit) params.set('limit', String(opts.limit));
  return request(`/api/admin/sessions?${params.toString()}`, adminSessionsResponseSchema);
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

/** Son sistem hataları (genel bakışta kısa liste; tam sayfa M5c-3'te). */
export function listAdminErrors(
  opts: { limit?: number; cursor?: string } = {},
): Promise<z.infer<typeof adminErrorsResponseSchema>> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.cursor) params.set('cursor', opts.cursor);
  return request(`/api/admin/errors?${params.toString()}`, adminErrorsResponseSchema);
}
