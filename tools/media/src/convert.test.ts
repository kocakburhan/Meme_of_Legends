import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { binary, run } from './binaries.js';
import { convert, probe } from './convert.js';
let dir: string;
let ffmpeg: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mol-convert-test-'));
  ffmpeg = await binary('ffmpeg');
});
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});
it('video H.264/yuv420p/AAC, faststart, kapak, süre ve boyut', async () => {
  const input = join(dir, 'input.mov');
  await run(ffmpeg, [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=1000x800:r=10',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440',
    '-t',
    '1',
    '-c:v',
    'mpeg4',
    '-c:a',
    'aac',
    input,
  ]);
  const media = await convert(input, dir);
  const info = await probe(media.file);
  expect(info.streams.find((s) => s.codec_type === 'video')).toMatchObject({
    codec_name: 'h264',
    pix_fmt: 'yuv420p',
    width: 720,
    height: 576,
  });
  expect(info.streams.find((s) => s.codec_type === 'audio')?.codec_name).toBe('aac');
  expect(media.durationMs).toBeGreaterThanOrEqual(1000);
  expect(media.durationMs).toBeLessThan(1300);
  expect((await probe(media.cover!)).streams[0]?.codec_name).toBe('mjpeg');
  const data = await readFile(media.file);
  expect(data.indexOf('moov')).toBeLessThan(data.indexOf('mdat'));
}, 30000);
it('uzun video kesim ister, kesilince sessiz kalır', async () => {
  const input = join(dir, 'long.mp4');
  await run(ffmpeg, [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=64x48:r=10',
    '-t',
    '26',
    '-c:v',
    'libx264',
    input,
  ]);
  await expect(convert(input, dir)).rejects.toThrow('Kesim gerekli');
  await expect(convert(input, dir, 1, 27)).rejects.toThrow('Kesim aralığı');
  const media = await convert(input, dir, 5, 6);
  expect(media.durationMs).toBe(1000);
  expect((await probe(media.file)).streams.some((s) => s.codec_type === 'audio')).toBe(false);
}, 30000);
it('PNG/JPEG/WebP resimleri boyutlandırır, GIF animasyon kalır', async () => {
  for (const ext of ['png', 'jpg', 'webp']) {
    const input = join(dir, 'input.' + ext);
    await run(ffmpeg, [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=green:s=1600x800',
      '-frames:v',
      '1',
      input,
    ]);
    const media = await convert(input, dir);
    expect(media.mediaType).toBe('image');
    expect((await probe(media.file)).streams[0]).toMatchObject({
      width: 1280,
      height: 640,
      codec_name: 'mjpeg',
    });
  }
  const input = join(dir, 'input.gif');
  await run(ffmpeg, [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=s=80x60:r=5',
    '-t',
    '1',
    input,
  ]);
  const media = await convert(input, dir);
  expect(media.mediaType).toBe('gif');
  expect((await probe(media.file)).streams[0]?.codec_name).toBe('gif');
  expect(Number((await probe(media.file)).format.duration)).toBeGreaterThan(0.5);
}, 30000);
