import {
  adminBusinessCreatedResponseSchema,
  adminBusinessesResponseSchema,
  adminBusinessResponseSchema,
  adminErrorsResponseSchema,
  adminImpersonateResponseSchema,
  adminMemesResponseSchema,
  adminOkResponseSchema,
  adminPasswordResponseSchema,
  adminPromptHealthResponseSchema,
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

/**
 * Etiketlenmemiş meme kuyruğu. Sunucu sayı vermez; genel bakış en fazla 100
 * kayıt çeker, taşarsa "100+" gösterir.
 */
export function listUntaggedMemes(): Promise<z.infer<typeof adminMemesResponseSchema>> {
  return request(
    '/api/admin/memes?status=untagged&order=oldest&limit=100',
    adminMemesResponseSchema,
  );
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
