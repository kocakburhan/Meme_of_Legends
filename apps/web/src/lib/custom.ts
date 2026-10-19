/**
 * Özel içerik istemci kuralları (custom-content.md): istemci ön kontrolü ve
 * sunucu hata kodlarının Türkçe karşılıkları. Ağ erişimi `net/custom.ts`'te.
 */

export const MAX_CUSTOM_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Telefonda galeri ve kamerayı birlikte açar; video seçilirse uyarı verilir. */
export const CUSTOM_UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/*';

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v', '3gp', 'ogv']);

const MIME_TYPES: Record<string, 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
};

const EXTENSION_TYPES: Record<string, 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export type AllowedUploadMime = keyof typeof MIME_TYPES;

export type UploadCheck =
  | { ok: true; mime: AllowedUploadMime; mediaType: 'image' | 'gif' }
  | { ok: false; message: string };

export const VIDEO_UPLOAD_MESSAGE = 'Video yüklenemez; YouTube linki kullan.';

/**
 * Dosyayı sunucuya göndermeden önce biçim ve boyut kontrolü. Uzantı yalnız
 * tarayıcı MIME vermediğinde (ya da `image/jpg` gibi takma adlarda) kullanılır;
 * gerçek imza denetimi sunucudadır.
 */
export function checkUploadFile(file: { name: string; type: string; size: number }): UploadCheck {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = file.type.toLowerCase();

  if (type.startsWith('video/') || VIDEO_EXTENSIONS.has(extension))
    return { ok: false, message: VIDEO_UPLOAD_MESSAGE };

  const mime = MIME_TYPES[type] ?? EXTENSION_TYPES[extension];
  if (!mime) return { ok: false, message: 'Yalnız JPG, PNG, WebP veya GIF yükleyebilirsin.' };
  if (file.size <= 0) return { ok: false, message: 'Dosya boş görünüyor; başka bir dosya seç.' };
  if (file.size > MAX_CUSTOM_UPLOAD_BYTES)
    return { ok: false, message: "Dosya 10 MB'den büyük olamaz." };

  return { ok: true, mime, mediaType: mime === 'image/gif' ? 'gif' : 'image' };
}

export function uploadErrorMessage(code: string): string {
  switch (code) {
    case 'CUSTOM_CONTENT_DISABLED':
      return 'Bu turda özel içerik kapalı.';
    case 'CANNOT_SELECT':
      return 'Şu anda yükleme yapılamıyor; seçim süresi dolmuş olabilir.';
    case 'RECOVERING':
      return 'Devam ediyoruz; biraz sonra tekrar dene.';
    case 'CUSTOM_MEDIA_INVALID':
      return 'Dosya geçersiz. JPG, PNG, WebP veya GIF seç.';
    case 'CUSTOM_MEDIA_TOO_LARGE':
      return "Dosya 10 MB'den büyük olamaz.";
    case 'RATE_LIMITED':
      return 'Çok fazla yükleme denemesi; biraz bekle.';
    case 'INVALID_TOKEN':
      return 'Oturumun geçersizleşti; sayfayı yenileyip yeniden katıl.';
    case 'INVALID_REQUEST':
    case 'JSON_REQUIRED':
      return 'Yükleme isteği geçersiz; tekrar dene.';
    case 'FORBIDDEN':
      return 'Bu yükleme için yetkin yok.';
    case 'NOT_FOUND':
      return 'Yükleme bulunamadı; dosyayı yeniden seç.';
    default:
      return 'Yükleme olmadı; bağlantını kontrol edip tekrar dene.';
  }
}

export function youtubeErrorMessage(code: string): string {
  switch (code) {
    case 'YOUTUBE_INVALID_URL':
      return 'Geçersiz YouTube linki. İzleme, youtu.be, shorts veya embed linki yapıştır.';
    case 'YOUTUBE_NOT_EMBEDDABLE':
      return 'Bu video gömülemiyor; başka bir video seç.';
    case 'YOUTUBE_NOT_PUBLIC':
      return 'Video özel, silinmiş veya bulunamadı; herkese açık bir video seç.';
    case 'YOUTUBE_UNAVAILABLE':
      return "YouTube'a ulaşılamadı; biraz sonra tekrar dene.";
    case 'CUSTOM_CONTENT_DISABLED':
      return 'Bu turda özel içerik kapalı.';
    case 'CANNOT_SELECT':
      return 'Şu anda video seçilemez; seçim süresi dolmuş olabilir.';
    case 'RECOVERING':
      return 'Devam ediyoruz; biraz sonra tekrar dene.';
    case 'RATE_LIMITED':
      return 'Çok fazla doğrulama denemesi; biraz bekle.';
    case 'INVALID_TOKEN':
      return 'Oturumun geçersizleşti; sayfayı yenileyip yeniden katıl.';
    case 'INVALID_REQUEST':
    case 'JSON_REQUIRED':
      return 'Doğrulama isteği geçersiz; tekrar dene.';
    case 'FORBIDDEN':
      return 'Bu doğrulama için yetkin yok.';
    default:
      return 'Video doğrulanamadı; tekrar dene.';
  }
}
