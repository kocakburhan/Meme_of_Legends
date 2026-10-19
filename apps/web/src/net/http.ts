import {
  displayPairRequestSchema,
  displayPairResponseSchema,
  joinRequestSchema,
  joinResponseSchema,
  roomCodeSchema,
  roomInfoSchema,
  sessionConfigSchema,
  takeoverRequestSchema,
  takeoverResponseSchema,
  type DisplayPairResponse,
  type JoinResponse,
  type RoomInfo,
  type SessionConfig,
  type TakeoverResponse,
} from '@mol/shared';
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
    try {
      const data = (await response.json()) as { error?: { code?: string } };
      code = data.error?.code ?? code;
    } catch {
      /* Non-JSON error body. */
    }
    throw new HttpError(response.status, code);
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

/** Lobi açar (hak tüketmez); dönen oturumda oda kodu ve kimlik bulunur. */
export function createBusinessSession(
  settings?: Partial<SessionConfig>,
): Promise<z.infer<typeof createdSessionSchema>> {
  sessionConfigSchema.partial().parse(settings ?? {});
  return request('/api/business/sessions', z.strictObject({ session: createdSessionSchema }), {
    method: 'POST',
    body: JSON.stringify(settings ? { settings } : {}),
  });
}

export function cancelBusinessSession(sessionId: string): Promise<{ ok: true }> {
  return request(`/api/business/sessions/${encodeURIComponent(sessionId)}/cancel`, z.strictObject({ ok: z.literal(true) }), {
    method: 'POST',
  });
}
