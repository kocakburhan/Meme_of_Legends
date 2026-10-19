import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { binary, run } from './binaries.js';
export interface Probe {
  streams: {
    codec_type: string;
    codec_name: string;
    pix_fmt?: string;
    width?: number;
    height?: number;
    duration?: string;
  }[];
  format: { duration?: string; format_name: string };
}
export async function probe(path: string): Promise<Probe> {
  const { stdout } = await run(await binary('ffprobe'), [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    path,
  ]);
  return JSON.parse(stdout) as Probe;
}
export interface Converted {
  file: string;
  mime: string;
  cover?: string;
  mediaType: 'video' | 'image' | 'gif';
  durationMs?: number;
}
export async function convert(
  input: string,
  dir: string,
  start?: number,
  end?: number,
): Promise<Converted> {
  const info = await probe(input);
  const visual = info.streams.find((s) => s.codec_type === 'video');
  if (!visual) throw new Error('Geçersiz medya; görüntü akışı bulunamadı.');
  const handle = await open(input, 'r');
  const data = Buffer.alloc(32);
  try {
    await handle.read(data, 0, data.length, 0);
  } finally {
    await handle.close();
  }
  const gif = data.subarray(0, 6).toString().startsWith('GIF8');
  const image =
    (data[0] === 0xff && data[1] === 0xd8) ||
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP');
  const ffmpeg = await binary('ffmpeg');
  const scale = (limit: number) =>
    `scale=w='max(2,trunc(iw*min(1,${limit}/max(iw,ih))/2)*2)':h='max(2,trunc(ih*min(1,${limit}/max(iw,ih))/2)*2)',setsar=1`;
  if (gif || image) {
    if (start !== undefined || end !== undefined)
      throw new Error('Kesim yalnız videoda kullanılabilir.');
    const file = join(dir, gif ? 'media.gif' : 'media.jpg');
    await run(ffmpeg, [
      '-y',
      '-v',
      'error',
      '-i',
      input,
      '-map_metadata',
      '-1',
      '-vf',
      gif ? `${scale(1280)},split[a][b];[a]palettegen[p];[b][p]paletteuse` : scale(1280),
      ...(gif ? ['-loop', '0'] : ['-frames:v', '1', '-q:v', '3']),
      file,
    ]);
    return { file, mime: gif ? 'image/gif' : 'image/jpeg', mediaType: gif ? 'gif' : 'image' };
  }
  const duration = Number(info.format.duration ?? visual.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Video süresi belirlenemedi.');
  if (duration > 25 && start === undefined && end === undefined)
    throw new Error(`Kesim gerekli (süre: ${duration.toFixed(1)} sn); --start/--end belirtin.`);
  const from = start ?? 0;
  const to = end ?? duration;
  if (from < 0 || to > duration + 0.05 || to <= from || to - from > 25)
    throw new Error('Kesim aralığı video içinde, pozitif ve en fazla 25 sn olmalı.');
  const file = join(dir, 'media.mp4');
  await run(ffmpeg, [
    '-y',
    '-v',
    'error',
    '-i',
    input,
    '-ss',
    String(from),
    '-t',
    String(to - from),
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-map_metadata',
    '-1',
    '-vf',
    scale(720),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'medium',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    file,
  ]);
  const output = await probe(file);
  const durationMs = Math.round(Number(output.format.duration) * 1000);
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 25000)
    throw new Error('Çıktı süresi 25 sn sınırını aşıyor; kesimi biraz kısaltın.');
  const cover = join(dir, 'cover.jpg');
  await run(ffmpeg, ['-y', '-v', 'error', '-i', file, '-frames:v', '1', '-q:v', '3', cover]);
  return { file, mime: 'video/mp4', cover, mediaType: 'video', durationMs };
}
