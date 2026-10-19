import type { MediaRef } from '@mol/engine';

/**
 * Ekran bileşenlerinin sözleşmesi: her ekran bir `View` nesnesi + küçük bir
 * bağlam (oda, kimlik, saat) + geri çağrımlar alır. Ağ erişimi yoktur;
 * M3b'de WebSocket verisi bu prop'lara bağlanacak.
 */

export interface RoomInfo {
  /** 6 karakterlik oda kodu (0/O, 1/I kullanılmaz — SPEC 5.1). */
  code: string;
  businessName: string | null;
  /** Katılım linki; "Linki paylaş" için. */
  shareUrl: string;
}

/** Görüntüleyenin kendi kimliği; `View` bunu doğrudan taşımadığı için ayrı geçilir. */
export interface Me {
  id: string;
  nickname: string;
  role: 'player' | 'voter';
  /** Geç katılım kuralı (SPEC 5.6): bu turdan itibaren puanlayabilir. */
  votingFromRound?: number;
}

export type JoinRole = 'player' | 'voter';

export interface JoinInput {
  /** Oda kodu biliniyorsa null geçilir (kod `/oda/:code` yolundan gelir). */
  code: string | null;
  nickname: string;
  role: JoinRole;
}

export interface LibraryMeme {
  memeId: string;
  /** Kartta başlık olarak görünen açıklama (SPEC 6.1). */
  title: string;
  category: string;
  mediaType: 'image' | 'gif' | 'video';
  durationMs?: number;
  /** Sahte veride boş: çerçeve, yer tutucu desenle çizilir. */
  src?: string;
}

export type RateScore = 1 | 2 | 3 | 4 | 5;

/** Sonuç ekranında kişi başına tur sonucu notu; M3b protokolünde netleşecek. */
export type RoundOutcome = 'advanced' | 'eliminated' | 'bye';

/** Takma ad doğrulaması — motor kuralıyla aynı (SPEC 5.3). */
export function validateNickname(value: string): string | null {
  const trimmed = value.trim();
  const size = Array.from(trimmed).length;
  if (size < 2) return 'Takma ad en az 2 karakter olmalı.';
  if (size > 20) return 'Takma ad en fazla 20 karakter olabilir.';
  if (!/^[\p{L}\p{M}\p{N}\p{Zs}\p{Extended_Pictographic}\p{Emoji_Component}]+$/u.test(trimmed))
    return 'Yalnızca harf, rakam, boşluk ve emoji kullanılabilir.';
  return null;
}

/** Oda kodu doğrulaması: 6 karakter, karışan karakterler yok (SPEC 5.1). */
export function validateRoomCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  if (code.length !== 6) return 'Oda kodu 6 karakterdir.';
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code))
    return 'Kodda 0, O, 1 ve I kullanılmaz; tekrar kontrol et.';
  return null;
}

export function normalizeRoomCode(value: string): string {
  return value
    .toUpperCase()
    .replaceAll('O', '0')
    .replace(/[^A-Z2-9]/g, '');
}

export type { MediaRef };
