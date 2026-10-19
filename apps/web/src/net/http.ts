import {
  businessPromptResponseSchema,
  businessPromptSchema,
  businessPromptsResponseSchema,
  businessSessionsResponseSchema,
  createBusinessPromptRequestSchema,
  displayPairRequestSchema,
  displayPairResponseSchema,
  joinRequestSchema,
  joinResponseSchema,
  roomCodeSchema,
  roomInfoSchema,
  sessionConfigSchema,
  takeoverRequestSchema,
  takeoverResponseSchema,
  updateBusinessPromptRequestSchema,
  type DisplayPairResponse,
  type JoinResponse,
  type RoomInfo,
  type TakeoverResponse,
} from '@mol/shared';
import type { SessionConfig } from '@mol/engine';
import { z } from 'zod';

/**
 * HTTP istemcisi (protokol v0.2 §2): oda bilgisi, katılım, cihaz devri ve
 * ekran eşleştirme. Yanıtlar `@mol/shared` şemalarıyla doğrulanır; aynı
 * katman ileride konsol ve paneller tarafından da kullanılır.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    /** 409 PROMPT_DUPLICATE: çakışan kaydın kimliği (business-api.md §2). */
    readonly existingId?: string,
  ) {
    super(`${status} ${code}`);
  }
}

export type { RoomInfo };

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new HttpError(0, 'NETWORK_ERROR');
  }
  if (!response.ok) {
    let code = 'HTTP_' + response.status;
    let existingId: string | undefined;
    try {
      const data = (await response.json()) as { error?: { code?: string; existingId?: string } };
      code = data.error?.code ?? code;
      existingId = data.error?.existingId;
    } catch {
      /* Non-JSON error body. */
    }
    throw new HttpError(response.status, code, existingId);
  }
  try {
    return schema.parse(await response.json());
  } catch {
    throw new HttpError(response.status, 'INVALID_RESPONSE');
  }
}

const safeCode = (code: string): string => {
  if (!roomCodeSchema.safeParse(code).success) throw new HttpError(400, 'INVALID_ROOM_CODE');
  return code;
};

export function getRoom(code: string): Promise<RoomInfo> {
  return request(`/api/rooms/${safeCode(code)}`, roomInfoSchema);
}

export function joinRoom(
  code: string,
  input: { nickname: string; wants: 'player' | 'voter' },
  token?: string,
): Promise<JoinResponse> {
  safeCode(code);
  joinRequestSchema.parse(input);
  return request(`/api/rooms/${code}/join`, joinResponseSchema, {
    method: 'POST',
    body: JSON.stringify(input),
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  });
}

export function requestTakeover(
  code: string,
  input: { nickname: string } | { requestId: string; receipt: string },
): Promise<TakeoverResponse> {
  safeCode(code);
  takeoverRequestSchema.parse(input);
  return request(`/api/rooms/${code}/takeover`, takeoverResponseSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function pairDisplay(code: string): Promise<DisplayPairResponse> {
  displayPairRequestSchema.parse({ code });
  return request('/api/display/pair', displayPairResponseSchema, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

const memeSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
  category: z.string().nullable(),
  mediaType: z.enum(['image', 'gif', 'video']),
});
const librarySchema = z.strictObject({ memes: z.array(memeSchema) });

/** Sistem meme kütüphanesi; seçim ekranının listesi. */
export function getLibrary(code: string): Promise<z.infer<typeof librarySchema>> {
  return request(`/api/rooms/${safeCode(code)}/library`, librarySchema);
}

/* ------------------------- İşletme API'si (M4) ------------------------- */

/**
 * İşletme oturumu ve oturum işlemleri (docs/contracts/business-api.md):
 * kimlik HttpOnly çerezle taşınır; şemalar M4a'da `@mol/shared`'a taşınana
 * dek burada tanımlıdır.
 */
export interface BusinessAccount {
  id: string;
  name: string;
  username: string;
  credits: number;
  unlimitedCredits: boolean;
  concurrentSessionLimit: number;
  lobbyLifetimeHours: number;
  active: boolean;
}

const businessAccountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  username: z.string().min(1),
  credits: z.number().int().nonnegative(),
  unlimitedCredits: z.boolean(),
  concurrentSessionLimit: z.number().int().positive(),
  lobbyLifetimeHours: z.number().int().positive(),
  active: z.boolean(),
});

export function loginBusiness(input: { username: string; password: string }): Promise<{ ok: true }> {
  return request('/api/auth/business/login', z.strictObject({ ok: z.literal(true) }), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function logoutBusiness(): Promise<{ ok: true }> {
  return request('/api/auth/business/logout', z.strictObject({ ok: z.literal(true) }), {
    method: 'POST',
  });
}

export function getBusinessMe(): Promise<{ business: BusinessAccount }> {
  return request('/api/business/me', z.strictObject({ business: businessAccountSchema }));
}

const createdSessionSchema = z.object({
  id: z.string().min(1),
  roomCode: roomCodeSchema,
  status: z.enum(['lobby', 'running', 'paused', 'finished', 'cancelled', 'terminated']),
});
export type BusinessSession = z.infer<typeof createdSessionSchema>;

/** Lobi açar (hak tüketmez); dönen oturumda oda kodu ve kimlik bulunur. */
export function createBusinessSession(settings?: Partial<SessionConfig>): Promise<BusinessSession> {
  sessionConfigSchema.partial().parse(settings ?? {});
  return request('/api/business/sessions', z.strictObject({ session: createdSessionSchema }), {
    method: 'POST',
    body: JSON.stringify(settings ? { settings } : {}),
  }).then((d) => d.session);
}

export function cancelBusinessSession(sessionId: string): Promise<{ ok: true }> {
  return request(`/api/business/sessions/${encodeURIComponent(sessionId)}/cancel`, z.strictObject({ ok: z.literal(true) }), {
    method: 'POST',
  });
}

export type BusinessSessionList = z.infer<typeof businessSessionsResponseSchema>;

/**
 * İşletmenin oturum listesi (docs/contracts/business-api.md §2): `active`
 * lobi/oyun/duraklatılmışları, `past` biten/iptal/sonlandırılanları döner.
 */
export function listBusinessSessions(
  status: 'active' | 'past',
  opts: { cursor?: string; limit?: number } = {},
): Promise<BusinessSessionList> {
  const params = new URLSearchParams({ status });
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit) params.set('limit', String(opts.limit));
  return request(`/api/business/sessions?${params.toString()}`, businessSessionsResponseSchema);
}

/** Şifre değiştirir; bu oturum açık kalır, diğer cihazlardaki girişler kapanır. */
export function changeBusinessPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: true }> {
  return request('/api/auth/business/password', z.strictObject({ ok: z.literal(true) }), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/* --------------------- İşletme durumları (M4c-2, 6.2) --------------------- */

export type BusinessPrompt = z.infer<typeof businessPromptSchema>;
export type BusinessPromptList = z.infer<typeof businessPromptsResponseSchema>;
export type PromptStatusFilter = 'active' | 'archived' | 'all';

/**
 * İşletmenin durum kütüphanesi (docs/contracts/business-api.md §2): arama
 * metinde, Türkçe büyük/küçük harf duyarsız; imleç yeniden eskiye sayfalar.
 */
export function listBusinessPrompts(
  opts: { q?: string; status?: PromptStatusFilter; cursor?: string; limit?: number } = {},
): Promise<BusinessPromptList> {
  const params = new URLSearchParams({ status: opts.status ?? 'active' });
  if (opts.q) params.set('q', opts.q);
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit) params.set('limit', String(opts.limit));
  return request(`/api/business/prompts?${params.toString()}`, businessPromptsResponseSchema);
}

/** Yeni durum ekler; metin yerinde şemayla doğrulanır (3–160, link/HTML yok). */
export function createBusinessPrompt(text: string): Promise<{ prompt: BusinessPrompt }> {
  createBusinessPromptRequestSchema.parse({ text });
  return request('/api/business/prompts', businessPromptResponseSchema, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

/** Durumu düzenler veya arşivler / yeniden etkinleştirir. */
export function updateBusinessPrompt(
  id: string,
  patch: { text?: string; status?: 'active' | 'archived' },
): Promise<{ prompt: BusinessPrompt }> {
  updateBusinessPromptRequestSchema.parse(patch);
  return request(`/api/business/prompts/${encodeURIComponent(id)}`, businessPromptResponseSchema, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}
