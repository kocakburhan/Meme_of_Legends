import { describe, expect, it } from 'vitest';
import { canonicalize, concurrent, downloadError, parseCli, summarize, timestamp } from './core.js';
describe('linkler', () => {
  it.each([
    ['https://youtu.be/abc_123?si=tracking', 'https://www.youtube.com/watch?v=abc_123'],
    [
      'https://m.youtube.com/shorts/abc_123?feature=share',
      'https://www.youtube.com/watch?v=abc_123',
    ],
    [
      'https://www.youtube.com/watch?v=abc_123&t=5&list=x',
      'https://www.youtube.com/watch?v=abc_123',
    ],
    ['https://twitter.com/user/status/123/video/1?s=20', 'https://x.com/i/status/123'],
    ['https://www.instagram.com/reel/ABC/?igsh=tracking', 'https://www.instagram.com/reel/ABC/'],
  ])('%s', (input, expected) => expect(canonicalize(input)).toBe(expected));
  it('desteklenmeyen veya aldatıcı alan adlarını reddeder', () => {
    for (const url of [
      'https://x.com.evil.test/a/status/123',
      'file:///x',
      'https://youtube.com/',
      'https://x.com/user',
    ])
      expect(() => canonicalize(url)).toThrow();
  });
});
it('komut ve kesim ayrıştırır, geçersiz seçenekleri reddeder', () => {
  expect(parseCli(['add', 'a.mp4', '--start', '0:05', '--end', '0:20', '--dry-run'])).toMatchObject(
    { start: 5, end: 20, dryRun: true },
  );
  expect(timestamp('1:02:03.5')).toBe(3723.5);
  for (const args of [
    ['add'],
    ['wat'],
    ['import', 'x', '--start', '5'],
    ['add', 'x', '--end', '26'],
    ['add', 'x', '--start', 'bad'],
    ['add', 'x', '--unknown'],
  ])
    expect(() => parseCli(args)).toThrow();
});
it.each([
  ['Private video', 'gizli'],
  ['Please sign in', 'giriş'],
  ['Video has been removed', 'silinmiş'],
  ['Unsupported URL', 'Desteklenmeyen'],
  ['Connection timed out', 'Ağ hatası'],
  ['Unknown extractor failure', 'güncelle'],
])('indirme hatasını sınıflandırır: %s', (message, expected) => {
  const result = downloadError(message);
  expect(
    expected === 'güncelle' ? result.includes('pnpm media update') : result.includes(expected),
  ).toBe(true);
});
it('rapor özeti', () =>
  expect(
    summarize([
      { source: 'a', result: 'uploaded', memeId: '1' },
      { source: 'b', result: 'error', error: 'kesim' },
      { source: 'c', result: 'duplicate', memeId: '1' },
    ]),
  ).toEqual({ total: 3, uploaded: 1, duplicate: 1, dryRun: 0, failed: 1 }));
it('en fazla iki işi çalıştırır, sıralamayı korur', async () => {
  let active = 0;
  let max = 0;
  const results = await concurrent([1, 2, 3, 4, 5], async (value) => {
    max = Math.max(max, ++active);
    await new Promise((resolve) => setTimeout(resolve, value % 2 ? 10 : 1));
    active--;
    return value * 2;
  });
  expect(max).toBe(2);
  expect(results).toEqual([2, 4, 6, 8, 10]);
});
