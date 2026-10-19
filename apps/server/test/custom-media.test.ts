import { describe, expect, it, vi, afterEach } from 'vitest';
import { customFixture as fixture } from './fixtures/custom';
import {
  MAX_CUSTOM_BYTES,
  sanitizeCustomMedia,
  youtubeId,
  validateYoutube,
} from '../src/custom-media';

afterEach(() => vi.restoreAllMocks());
describe('custom image sanitization', () => {
  it.each([
    ['gps.jpg', 'image/jpeg', 'jpg'],
    ['metadata.png', 'image/png', 'png'],
    ['metadata.webp', 'image/webp', 'webp'],
    ['animated.gif', 'image/gif', 'gif'],
  ])('removes private metadata from %s', (name, mime, ext) => {
    const original = fixture(name!);
    const clean = sanitizeCustomMedia(original, mime!);
    expect(clean.ext).toBe(ext);
    expect(clean.data.length).toBeLessThan(original.length);
    const text = new TextDecoder('latin1').decode(clean.data);
    for (const word of ['private-location', 'Exif', 'eXIf', 'EXIF', 'XMP ', 'PRIVATEAPP10'])
      expect(text).not.toContain(word);
    // Container can be parsed repeatedly; animation control and both frames survive.
    expect(sanitizeCustomMedia(clean.data, mime!).data).toEqual(clean.data);
    if (ext === 'gif') {
      expect(text).toContain('NETSCAPE2.0');
      expect([...clean.data].filter((x) => x === 44)).toHaveLength(2);
    }
  });
  it('rejects forged signatures, MIME mismatches, truncation, empty and oversized bodies', () => {
    for (const data of [
      new Uint8Array(),
      new Uint8Array(MAX_CUSTOM_BYTES + 1),
      new TextEncoder().encode('not an image'),
      fixture('gps.jpg').slice(0, 20),
    ]) {
      expect(() => sanitizeCustomMedia(data, 'image/jpeg')).toThrow();
    }
    expect(() => sanitizeCustomMedia(fixture('gps.jpg'), 'image/png')).toThrow();
  });
});
describe('YouTube validation', () => {
  const id = 'dQw4w9WgXcQ';
  it.each([
    `https://www.youtube.com/watch?v=${id}&t=2`,
    `https://youtu.be/${id}?si=abc`,
    `https://youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
  ])('parses %s', (url) => expect(youtubeId(url)).toBe(id));
  it.each([
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'file:///watch?v=dQw4w9WgXcQ',
    'https://youtu.be/short',
    'https://user@youtube.com/watch?v=dQw4w9WgXcQ',
  ])('rejects %s', (url) => expect(() => youtubeId(url)).toThrow());
  it.each([
    [401, 'YOUTUBE_NOT_EMBEDDABLE'],
    [403, 'YOUTUBE_NOT_EMBEDDABLE'],
    [404, 'YOUTUBE_NOT_PUBLIC'],
    [503, 'YOUTUBE_UNAVAILABLE'],
  ])('maps upstream %s', async (status, code) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: Number(status) }));
    await expect(validateYoutube(id)).rejects.toMatchObject({ code });
  });
  it('returns null duration, rejects invalid embed responses and network failures', async () => {
    const mock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json({
          html: '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
        }),
      );
    await expect(validateYoutube(id)).resolves.toEqual({ videoId: id, durationMs: null });
    mock.mockResolvedValue(Response.json({}));
    await expect(validateYoutube(id)).rejects.toMatchObject({ code: 'YOUTUBE_NOT_EMBEDDABLE' });
    mock.mockRejectedValue(new Error('network'));
    await expect(validateYoutube(id)).rejects.toMatchObject({ code: 'YOUTUBE_UNAVAILABLE' });
  });
});
