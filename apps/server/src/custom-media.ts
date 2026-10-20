import { ApiFailure } from './auth';

export const MAX_CUSTOM_BYTES = 10 * 1024 * 1024;
const invalid = (): never => {
  throw new ApiFailure(422, 'CUSTOM_MEDIA_INVALID');
};
const join = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
/** Parse container boundaries, retaining only rendering data. Never decode pixels. */
export function sanitizeCustomMedia(b: Uint8Array, mime: string) {
  if (!b.length || b.length > MAX_CUSTOM_BYTES) invalid();
  const text = (a: number, z: number) => String.fromCharCode(...b.slice(a, z));
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const parts: Uint8Array[] = [];
  let ext: string, contentType: string;
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) {
    ext = 'jpg';
    contentType = 'image/jpeg';
    parts.push(b.slice(0, 2));
    let p = 2,
      ended = false;
    while (p < b.length) {
      const start = p;
      if (b[p++] !== 255) invalid();
      while (b[p] === 255) p++;
      const marker = b[p++]!;
      if (marker === 217) {
        parts.push(b.slice(start, p));
        ended = true;
        break;
      }
      if (marker === undefined || marker === 0 || marker === 216) invalid();
      if (marker === 1 || (marker >= 208 && marker <= 215)) {
        parts.push(b.slice(start, p));
        continue;
      }
      if (p + 2 > b.length) invalid();
      const size = view.getUint16(p);
      if (size < 2 || p + size > b.length) invalid();
      const end = p + size;
      // APP0 is canonical JFIF only; APP14 only the Adobe colour transform.
      if (!(marker >= 224 && marker <= 239) && marker !== 254) parts.push(b.slice(start, end));
      else if (marker === 224 && size === 16 && text(p + 2, p + 7) === 'JFIF\0') {
        parts.push(b.slice(start, end));
      } else if (marker === 238 && size === 14 && text(p + 2, p + 7) === 'Adobe')
        parts.push(b.slice(start, end));
      p = end;
      if (marker === 218) {
        const scan = p;
        while (p < b.length) {
          if (b[p] !== 255) {
            p++;
            continue;
          }
          let q = p + 1;
          while (b[q] === 255) q++;
          if (b[q] === 0 || (b[q]! >= 208 && b[q]! <= 215)) {
            p = q + 1;
            continue;
          }
          break;
        }
        parts.push(b.slice(scan, p));
      }
    }
    if (!ended) invalid();
  } else if (text(0, 8) === '\x89PNG\r\n\x1a\n') {
    ext = 'png';
    contentType = 'image/png';
    parts.push(b.slice(0, 8));
    let p = 8,
      ended = false,
      header = false,
      pixels = false;
    // APNG chunks preserve animation; ancillary metadata is dropped wholesale.
    const keep = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'acTL', 'fcTL', 'fdAT']);
    while (p + 12 <= b.length) {
      const n = view.getUint32(p),
        kind = text(p + 4, p + 8),
        end = p + 12 + n;
      if (end > b.length || (!header && (kind !== 'IHDR' || n !== 13))) invalid();
      header = true;
      if (kind === 'IDAT') pixels = true;
      if (keep.has(kind)) parts.push(b.slice(p, end));
      else if (kind[0] === kind[0]?.toUpperCase()) invalid();
      p = end;
      if (kind === 'IEND') {
        if (n !== 0) invalid();
        ended = true;
        break;
      }
    }
    if (!ended || !pixels) invalid();
  } else if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') {
    ext = 'webp';
    contentType = 'image/webp';
    if (b.length < 12 || view.getUint32(4, true) + 8 !== b.length) invalid();
    parts.push(b.slice(0, 12));
    let p = 12,
      pixels = false;
    while (p + 8 <= b.length) {
      const kind = text(p, p + 4),
        n = view.getUint32(p + 4, true),
        end = p + 8 + n + (n % 2);
      if (end > b.length) invalid();
      if (['VP8 ', 'VP8L', 'ANMF'].includes(kind)) pixels = true;
      if (['VP8X', 'VP8 ', 'VP8L', 'ALPH', 'ANIM', 'ANMF'].includes(kind)) {
        const chunk = b.slice(p, end);
        if (kind === 'VP8X') {
          if (n !== 10) invalid();
          chunk[8] = chunk[8]! & ~0x2c;
        }
        parts.push(chunk);
      }
      p = end;
    }
    if (p !== b.length || !pixels) invalid();
    const out = join(parts);
    new DataView(out.buffer).setUint32(4, out.length - 8, true);
    if (mime !== contentType) invalid();
    return { data: out, ext, contentType, mediaType: 'image' as const };
  } else if (['GIF87a', 'GIF89a'].includes(text(0, 6))) {
    ext = 'gif';
    contentType = 'image/gif';
    if (b.length < 13) invalid();
    let p = 13 + (b[10]! & 128 ? 3 * (1 << ((b[10]! & 7) + 1)) : 0);
    if (p > b.length) invalid();
    parts.push(b.slice(0, p));
    let ended = false,
      pixels = false;
    const blocks = () => {
      while (p < b.length) {
        const n = b[p++]!;
        if (!n) return;
        p += n;
        if (p > b.length) invalid();
      }
      invalid();
    };
    while (p < b.length) {
      const start = p,
        kind = b[p++];
      if (kind === 59) {
        parts.push(b.slice(start, p));
        ended = true;
        break;
      }
      if (kind === 44) {
        if (p + 9 > b.length) invalid();
        const packed = b[p + 8]!;
        p += 9 + (packed & 128 ? 3 * (1 << ((packed & 7) + 1)) : 0);
        if (p >= b.length) invalid();
        p++;
        blocks();
        parts.push(b.slice(start, p));
        pixels = true;
      } else if (kind === 33) {
        const label = b[p++];
        const loop =
          label === 255 &&
          b[p] === 11 &&
          ['NETSCAPE2.0', 'ANIMEXTS1.0'].includes(text(p + 1, p + 12));
        if (loop) {
          // Preserve only the canonical looping instruction, never arbitrary app payload.
          if (b[p + 12] !== 3 || b[p + 13] !== 1 || b[p + 16] !== 0) invalid();
          parts.push(b.slice(start, p + 17));
          p += 17;
        } else {
          if (label === 249 && (b[p] !== 4 || b[p + 5] !== 0)) invalid();
          blocks();
          if (label === 249) parts.push(b.slice(start, p));
        }
      } else invalid();
    }
    if (!ended || !pixels) invalid();
  } else return invalid();
  if (mime !== contentType) invalid();
  return {
    data: join(parts),
    ext,
    contentType,
    mediaType: ext === 'gif' ? ('gif' as const) : ('image' as const),
  };
}

export function youtubeId(input: string): string {
  try {
    const u = new URL(input);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return invalidYoutube();
    const host = u.hostname.toLowerCase();
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.slice(1);
    if (
      [
        'youtube.com',
        'www.youtube.com',
        'm.youtube.com',
        'youtube-nocookie.com',
        'www.youtube-nocookie.com',
      ].includes(host)
    ) {
      id =
        u.pathname === '/watch'
          ? u.searchParams.get('v')
          : (/^\/(?:shorts|embed)\/([^/]+)\/?$/.exec(u.pathname)?.[1] ?? null);
    }
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id) || u.username || u.password || u.port)
      return invalidYoutube();
    return id;
  } catch {
    return invalidYoutube();
  }
}
function invalidYoutube(): never {
  throw new ApiFailure(422, 'YOUTUBE_INVALID_URL');
}
export async function validateYoutube(videoId: string) {
  let response: Response;
  try {
    response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
      // Workers yalnız 'follow' / 'manual' destekler; 'error' fetch'i her zaman düşürür.
      { signal: AbortSignal.timeout(5000), redirect: 'manual' },
    );
  } catch {
    throw new ApiFailure(503, 'YOUTUBE_UNAVAILABLE');
  }
  if (response.status >= 300 && response.status < 400)
    throw new ApiFailure(503, 'YOUTUBE_UNAVAILABLE');
  if ([401, 403].includes(response.status)) throw new ApiFailure(422, 'YOUTUBE_NOT_EMBEDDABLE');
  if ([400, 404].includes(response.status)) throw new ApiFailure(422, 'YOUTUBE_NOT_PUBLIC');
  if (!response.ok) throw new ApiFailure(503, 'YOUTUBE_UNAVAILABLE');
  try {
    const data = await response.json<{ html?: string }>();
    if (!data.html?.includes('<iframe')) throw new Error();
  } catch {
    throw new ApiFailure(422, 'YOUTUBE_NOT_EMBEDDABLE');
  }
  return { videoId, durationMs: null };
}

export async function cleanupCustomUploads(env: Cloudflare.Env, sessionId: string) {
  const rows = await env.DB.prepare('SELECT id,r2_key FROM custom_uploads WHERE session_id=?')
    .bind(sessionId)
    .all<{ id: string; r2_key: string }>();
  // Delete objects first; a failed delete leaves the DB record available for retry.
  for (const row of rows.results) {
    await env.MEDIA.delete(row.r2_key);
    await env.DB.prepare('DELETE FROM custom_uploads WHERE id=?').bind(row.id).run();
  }
}
export async function sweepCustomUploads(env: Cloudflare.Env) {
  const rows = await env.DB.prepare(
    "SELECT DISTINCT u.session_id FROM custom_uploads u LEFT JOIN game_sessions s ON s.id=u.session_id WHERE s.id IS NULL OR s.status IN ('finished','terminated','cancelled')",
  ).all<{ session_id: string }>();
  for (const row of rows.results) await cleanupCustomUploads(env, row.session_id);
  // Also collect orphaned objects left by a crash before the row was inserted.
  let cursor: string | undefined;
  do {
    const page = await env.MEDIA.list({ prefix: 'custom/', cursor });
    for (const object of page.objects) {
      if (object.uploaded.getTime() > Date.now() - 3600000) continue;
      const row = await env.DB.prepare('SELECT 1 FROM custom_uploads WHERE r2_key=?')
        .bind(object.key)
        .first();
      if (!row) await env.MEDIA.delete(object.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
