import { describe, expect, it } from 'vitest';

import {
  MAX_CUSTOM_UPLOAD_BYTES,
  VIDEO_UPLOAD_MESSAGE,
  checkUploadFile,
  uploadErrorMessage,
  youtubeErrorMessage,
} from './custom';

const file = (name: string, type: string, size = 1024) => ({ name, type, size });

describe('checkUploadFile', () => {
  it('video dosyasını YouTube yönlendirmesiyle reddeder', () => {
    expect(checkUploadFile(file('klip.mp4', 'video/mp4'))).toEqual({
      ok: false,
      message: VIDEO_UPLOAD_MESSAGE,
    });
    // Tür boş gelse de uzantıdan anlaşılır.
    expect(checkUploadFile(file('klip.mov', ''))).toEqual({
      ok: false,
      message: VIDEO_UPLOAD_MESSAGE,
    });
  });

  it('JPG, PNG, WebP ve GIF türlerini kabul eder', () => {
    expect(checkUploadFile(file('a.jpg', 'image/jpeg'))).toEqual({
      ok: true,
      mime: 'image/jpeg',
      mediaType: 'image',
    });
    expect(checkUploadFile(file('a.png', 'image/png'))).toEqual({
      ok: true,
      mime: 'image/png',
      mediaType: 'image',
    });
    expect(checkUploadFile(file('a.webp', 'image/webp'))).toEqual({
      ok: true,
      mime: 'image/webp',
      mediaType: 'image',
    });
    expect(checkUploadFile(file('a.gif', 'image/gif'))).toEqual({
      ok: true,
      mime: 'image/gif',
      mediaType: 'gif',
    });
  });

  it('image/jpg takma adını image/jpeg olarak normalize eder', () => {
    expect(checkUploadFile(file('a.jpg', 'image/jpg'))).toEqual({
      ok: true,
      mime: 'image/jpeg',
      mediaType: 'image',
    });
  });

  it('MIME boşsa uzantıdan tür çıkarır', () => {
    expect(checkUploadFile(file('a.GIF', ''))).toEqual({
      ok: true,
      mime: 'image/gif',
      mediaType: 'gif',
    });
  });

  it('desteklenmeyen türü reddeder', () => {
    expect(checkUploadFile(file('a.heic', 'image/heic'))).toEqual({
      ok: false,
      message: 'Yalnız JPG, PNG, WebP veya GIF yükleyebilirsin.',
    });
  });

  it('10 MB üstünü istemcide reddeder', () => {
    expect(checkUploadFile(file('a.png', 'image/png', MAX_CUSTOM_UPLOAD_BYTES + 1))).toEqual({
      ok: false,
      message: "Dosya 10 MB'den büyük olamaz.",
    });
    expect(checkUploadFile(file('a.png', 'image/png', MAX_CUSTOM_UPLOAD_BYTES)).ok).toBe(true);
  });
});

describe('hata mesajları', () => {
  it('yükleme hata kodlarını Türkçeleştirir', () => {
    expect(uploadErrorMessage('CUSTOM_MEDIA_TOO_LARGE')).toBe("Dosya 10 MB'den büyük olamaz.");
    expect(uploadErrorMessage('CUSTOM_MEDIA_INVALID')).toContain('Dosya geçersiz');
    expect(uploadErrorMessage('RATE_LIMITED')).toContain('Çok fazla');
    expect(uploadErrorMessage('BILINMEYEN')).toContain('Yükleme olmadı');
  });

  it('YouTube hata kodlarını Türkçeleştirir', () => {
    expect(youtubeErrorMessage('YOUTUBE_NOT_EMBEDDABLE')).toBe(
      'Bu video gömülemiyor; başka bir video seç.',
    );
    expect(youtubeErrorMessage('YOUTUBE_NOT_PUBLIC')).toContain('özel');
    expect(youtubeErrorMessage('YOUTUBE_INVALID_URL')).toContain('Geçersiz');
    expect(youtubeErrorMessage('YOUTUBE_UNAVAILABLE')).toContain('ulaşılamadı');
  });
});
