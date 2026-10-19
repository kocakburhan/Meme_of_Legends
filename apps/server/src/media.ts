import { adminMemeMetaSchema } from '@mol/shared';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { ApiFailure, json } from './auth';
import { adminActions, categories, memes } from './db/schema';
import { audit, uniqueFailure } from './admin-common';
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
export function mediaUrl(key: string) {
  return `/media/${key.split('/').map(encodeURIComponent).join('/')}`;
}
export function publicMeme(meme: typeof memes.$inferSelect) {
  return {
    ...meme,
    mediaUrl: mediaUrl(meme.r2Key),
    ...(meme.coverKey ? { coverUrl: mediaUrl(meme.coverKey) } : {}),
  };
}
async function validateFile(file: string | File | null, type: 'image' | 'gif' | 'video' | 'cover') {
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_MEDIA_BYTES)
    throw new ApiFailure(422, 'MEDIA_INVALID');
  const data = await file.arrayBuffer();
  const b = new Uint8Array(data);
  const ascii = (start: number, end: number) => String.fromCharCode(...b.slice(start, end));
  let ext: string | undefined;
  let contentType: string | undefined;
  if ((type === 'image' || type === 'cover') && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    ext = 'jpg';
    contentType = 'image/jpeg';
  }
  if (type === 'image' && b.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10') {
    ext = 'png';
    contentType = 'image/png';
  }
  if ((type === 'image' || type === 'cover') && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    ext = 'webp';
    contentType = 'image/webp';
  }
  if (type === 'gif' && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) {
    ext = 'gif';
    contentType = 'image/gif';
  }
  if (type === 'video' && ascii(4, 8) === 'ftyp' && validMp4(b)) {
    ext = 'mp4';
    contentType = 'video/mp4';
  }
  if (!ext || file.type !== contentType) throw new ApiFailure(422, 'MEDIA_INVALID');
  return { data, ext, contentType };
}
// Inspect sample descriptions, rather than trusting MIME or the filename. Decode and
// transcoding stay in the local media tool. Audio is optional, but must be AAC if present.
function validMp4(b: Uint8Array): boolean {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const text = (start: number, end: number) => String.fromCharCode(...b.slice(start, end));
  let video = false,
    valid = true;
  function boxes(start: number, end: number, depth = 0) {
    if (depth > 20) {
      valid = false;
      return;
    }
    for (let offset = start; offset + 8 <= end;) {
      let size = view.getUint32(offset),
        header = 8;
      const kind = text(offset + 4, offset + 8);
      if (size === 1) {
        if (offset + 16 > end) {
          valid = false;
          return;
        }
        size = Number(view.getBigUint64(offset + 8));
        header = 16;
      }
      if (size === 0) size = end - offset;
      if (size < header || offset + size > end) {
        valid = false;
        return;
      }
      if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(kind))
        boxes(offset + header, offset + size, depth + 1);
      if (kind === 'stsd') {
        if (offset + header + 8 > offset + size) {
          valid = false;
          return;
        }
        const count = view.getUint32(offset + header + 4);
        let entry = offset + header + 8;
        for (let i = 0; i < count; i++) {
          if (entry + 8 > offset + size) {
            valid = false;
            return;
          }
          const length = view.getUint32(entry),
            codec = text(entry + 4, entry + 8);
          if (length < 8 || entry + length > offset + size) {
            valid = false;
            return;
          }
          if (codec === 'avc1' || codec === 'avc3') video = true;
          else if (codec !== 'mp4a') valid = false;
          entry += length;
        }
      }
      offset += size;
    }
  }
  boxes(0, b.length);
  return valid && video;
}
export async function uploadMeme(request: Request, env: Cloudflare.Env) {
  const length = Number(request.headers.get('content-length'));
  if (length > MAX_MEDIA_BYTES * 2 + 65536) throw new ApiFailure(422, 'MEDIA_INVALID');
  let form: FormData;
  let meta;
  try {
    form = await request.formData();
    if (
      [...form.keys()].some((k) => !['file', 'cover', 'meta'].includes(k)) ||
      ['file', 'cover', 'meta'].some((k) => form.getAll(k).length > 1)
    )
      throw new Error('fields');
    meta = adminMemeMetaSchema.parse(JSON.parse(String(form.get('meta'))));
  } catch {
    throw new ApiFailure(422, 'MEDIA_INVALID');
  }
  const db = drizzle(env.DB);
  const duplicate = async () =>
    meta.sourceUrl
      ? await db.select().from(memes).where(eq(memes.sourceUrl, meta.sourceUrl)).get()
      : undefined;
  const existing = await duplicate();
  if (existing) throw new ApiFailure(409, 'MEME_DUPLICATE', { existingId: existing.id });
  if (
    meta.categoryId &&
    !(await db.select().from(categories).where(eq(categories.id, meta.categoryId)).get())
  )
    throw new ApiFailure(422, 'CATEGORY_NOT_FOUND');
  const file = await validateFile(form.get('file'), meta.mediaType);
  const cover = form.has('cover') ? await validateFile(form.get('cover'), 'cover') : undefined;
  const id = crypto.randomUUID();
  const r2Key = `memes/${id}/media.${file.ext}`,
    coverKey = cover ? `memes/${id}/cover.${cover.ext}` : null;
  try {
    await env.MEDIA.put(r2Key, file.data, { httpMetadata: { contentType: file.contentType } });
    if (cover && coverKey)
      await env.MEDIA.put(coverKey, cover.data, {
        httpMetadata: { contentType: cover.contentType },
      });
    const meme = {
      id,
      categoryId: meta.categoryId ?? null,
      description: meta.description ?? '',
      mediaType: meta.mediaType,
      r2Key,
      coverKey,
      durationMs: meta.durationMs ?? null,
      sourceUrl: meta.sourceUrl ?? null,
      status: meta.categoryId && meta.description ? ('active' as const) : ('untagged' as const),
      createdAt: Date.now(),
    };
    await db.batch([
      db.insert(memes).values(meme),
      db.insert(adminActions).values(audit('memeUploaded', id, meta)),
    ]);
    return json({ meme: publicMeme(meme) }, 201);
  } catch (error) {
    await env.MEDIA.delete([r2Key, ...(coverKey ? [coverKey] : [])]);
    if (uniqueFailure(error)) {
      const row = await duplicate();
      if (row) throw new ApiFailure(409, 'MEME_DUPLICATE', { existingId: row.id });
    }
    throw error;
  }
}
export async function serveMedia(request: Request, env: Cloudflare.Env, path: string) {
  if (!['GET', 'HEAD'].includes(request.method)) throw new ApiFailure(405, 'METHOD_NOT_ALLOWED');
  let key: string;
  try {
    key = decodeURIComponent(path.slice('/media/'.length));
  } catch {
    throw new ApiFailure(404, 'NOT_FOUND');
  }
  if (!/^memes\/[^/]+\/(media\.(jpg|png|webp|gif|mp4)|cover\.(jpg|webp))$/.test(key))
    throw new ApiFailure(404, 'NOT_FOUND');
  const head = await env.MEDIA.head(key);
  if (!head) throw new ApiFailure(404, 'NOT_FOUND');
  const headers = new Headers({
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: head.httpEtag,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
  });
  head.writeHttpMetadata(headers);
  if (
    request.headers
      .get('if-none-match')
      ?.split(',')
      .map((v) => v.trim())
      .some((v) => v === '*' || v.replace(/^W\//, '') === head.httpEtag)
  )
    return new Response(null, { status: 304, headers });
  let range: { offset: number; length: number } | undefined;
  const value = request.headers.get('range');
  const ifRange = request.headers.get('if-range');
  if (
    request.method === 'GET' &&
    value &&
    (!ifRange || ifRange === head.httpEtag || Date.parse(ifRange) >= head.uploaded.getTime())
  ) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(value);
    if (match && (match[1] || match[2])) {
      const start = match[1] ? Number(match[1]) : Math.max(0, head.size - Number(match[2]));
      const end = match[1] && match[2] ? Math.min(Number(match[2]), head.size - 1) : head.size - 1;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= head.size
      ) {
        headers.set('Content-Range', `bytes */${head.size}`);
        return new Response(null, { status: 416, headers });
      }
      range = { offset: start, length: end - start + 1 };
      headers.set('Content-Range', `bytes ${start}-${end}/${head.size}`);
    }
  }
  headers.set('Content-Length', String(range?.length ?? head.size));
  if (request.method === 'HEAD') return new Response(null, { headers });
  const object = await env.MEDIA.get(key, range ? { range } : undefined);
  if (!object) throw new ApiFailure(404, 'NOT_FOUND');
  return new Response(object.body, { status: range ? 206 : 200, headers });
}
