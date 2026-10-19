import type { Context, Phase, View } from '@mol/engine';

/**
 * Tek eşleme: motor/kabuk ret nedenlerini insan diline çevirir (görev 2).
 * Hem `ack.reason` hem koşul ipuçları buradan okur; arayüzde ayrı metin
 * yazılmaz.
 */

const NOTES: Record<string, string> = {
  // Motor retleri
  sessionClosed: 'Oturum kapandı; komut uygulanmadı.',
  paused: 'Oyun duraklatıldı; bu komut duraklatmada uygulanmaz.',
  notRunning: 'Oyun şu an sürmüyor; komut uygulanmadı.',
  notPaused: 'Oyun duraklatılmamış.',
  notLobby: 'Oyun başladı; bu işlem artık yapılamaz.',
  settingsLocked: 'Oyun başladı; mod ve tur sayısı artık değişmez.',
  invalidSettings: 'Ayar değerleri geçersiz.',
  insufficientPlayers: 'Yeterli oyuncu yok.',
  noPrompts: 'Durum havuzu boş; oyun başlatılamaz.',
  notSelection: 'Bu komut yalnız seçim aşamasında uygulanır.',
  notPresentation: 'Bu komut yalnız gönderi gösteriminde uygulanır.',
  notResults: 'Sonuç ekranında değil; komut uygulanmadı.',
  notReview: 'Gözden geçirme aşamasında değil.',
  cannotReplacePrompt: 'Durum değiştirme hakkı kullanıldı ya da süre doldu.',
  cannotRejectCustom: 'Bu içerik reddedilemez; zaten reddedilmiş ya da özel değil.',
  alreadyHidden: 'Bu gönderi zaten gizlendi.',
  unknownParticipant: 'Katılımcı bulunamadı.',
  notPending: 'Bu istek artık beklemiyor.',
  notPlayer: 'Bu katılımcı oyuncu değil.',
  cannotConfirm: 'Onaylanacak bir seçim yok.',
  cannotSelect: 'Şu anda seçim yapılamaz.',
  cannotRate: 'Şu anda puan verilemez.',
  invalidClock: 'Sunucu saati geçersiz.',
  // Kabuk ve sunucu retleri
  INSUFFICIENT_CREDITS: 'Oyun hakkı kalmadı; admin ek hak verebilir.',
  CONCURRENT_SESSION_LIMIT: 'Eşzamanlı oturum sınırı doldu.',
  SESSION_NOT_FINISHED: 'Oyun henüz bitmedi.',
  TAKEOVER_NOT_PENDING: 'Devri isteği artık beklemiyor.',
  PAIR_CODE_UNAVAILABLE: 'Eşleştirme kodu üretilemedi; tekrar dene.',
  UNAUTHENTICATED: 'Oturum geçersiz; yeniden giriş yap.',
  FORBIDDEN: 'Yetkin yok.',
  INVALID_COMMAND: 'Komut geçersiz.',
  RECOVERING: 'Sunucu toparlanıyor; komutlar kısa süre içinde açık.',
  ACK_TIMEOUT: 'Yanıt zaman aşımına uğradı; bağlantıyı kontrol et.',
  SOCKET_CLOSED: 'Bağlantı kapandı.',
};

export function ackReasonNote(reason?: string): string {
  if (!reason) return 'Komut uygulanmadı.';
  return NOTES[reason] ?? 'Komut uygulanmadı.';
}

export const STAGE_LABELS: Record<Context, string> = {
  elimination: 'Eleme',
  league: 'Lig',
  semifinal: 'Yarı final',
  final: 'Final',
};

/** Durum çubuğundaki kısa aşama + tur etiketi. */
export function phaseLabel(view: View): string {
  const p = view.phase;
  switch (p.kind) {
    case 'lobby':
      return 'Lobi';
    case 'selection':
      return `Tur ${p.roundNo} · Seçim`;
    case 'presentation':
      return `Tur ${p.roundNo} · Gösterim`;
    case 'review':
      return `Tur ${p.roundNo} · Gözden geçirme`;
    case 'reveal':
      return `Tur ${p.roundNo} · Sonuçlar açıklanıyor`;
    case 'results':
      return `Tur ${p.roundNo} · Sonuç`;
    case 'draw':
      return `Tur ${p.roundNo} · Kura`;
    case 'finished':
      return 'Oyun bitti';
  }
}

/** Geri sayımı olan fazların bitiş zamanı; reveal/lobi/finished'de null. */
export function phaseEndsAt(phase: Phase): number | null {
  return 'endsAt' in phase ? phase.endsAt : null;
}

/**
 * Başlat koşulu (SPEC 4.4): pasifken neden metni, sağlanıyorsa null.
 * Oyun hakkı işletme hesabından gelir.
 */
export function startBlockReason(
  view: View,
  credits: { credits: number; unlimitedCredits: boolean },
): string | null {
  const players = view.participants.filter((p) => p.role === 'player' && p.status === 'active');
  const need = view.config.mode === 'hybrid' ? 4 : 2;
  if (players.length < need) return need === 4 ? 'Hibrit modda en az 4 oyuncu gerek.' : 'En az 2 oyuncu gerek.';
  if (!credits.unlimitedCredits && credits.credits === 0) return 'Oyun hakkı kalmadı.';
  return null;
}

export const MODE_DESCRIPTIONS: Record<View['config']['mode'], string> = {
  elimination: 'Rastgele düellolar; kaybeden elenir, kazanan tur atlar.',
  league: 'Kimse elenmez; her turun puanı toplama eklenir.',
  hybrid: '5 tur lig + yarı finaller + final; toplam 11 tur.',
};
