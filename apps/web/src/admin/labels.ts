/**
 * Admin panelinde teknik kayıtları okunur Türkçeye çeviren ortak etiketler
 * (M5c-3). Bilinmeyen kayıtlar ham kodlarıyla gösterilir; uydurma yoktur.
 */

export const ADMIN_ACTION_LABELS: Record<string, string> = {
  businessCreated: 'İşletme oluşturuldu',
  businessUpdated: 'İşletme güncellendi',
  passwordReset: 'Şifre sıfırlandı',
  businessImpersonated: 'İşletme adına giriş',
  categoryCreated: 'Kategori oluşturuldu',
  categoryUpdated: 'Kategori güncellendi',
  platformPromptCreated: 'Platform durumu eklendi',
  platformPromptUpdated: 'Platform durumu güncellendi',
  businessPromptBlocked: 'İşletme durumu güncellendi',
  memeUploaded: 'Meme yüklendi',
  memeUpdated: 'Meme güncellendi',
  sessionTerminated: 'Oturum sonlandırıldı',
  sessionRefunded: 'Hak iade edildi',
};

export const AUDIT_LABELS: Record<string, string> = {
  lobbyCreated: 'Lobi açıldı',
  sessionStarted: 'Oyun başladı',
  sessionFinished: 'Oyun bitti',
  paused: 'Duraklatıldı',
  resumed: 'Devam etti',
  restored: 'Bağlantı kurtarıldı',
  contentHidden: 'İçerik gizlendi',
  customRejected: 'Özel içerik reddedildi',
  eliminated: 'Oyuncu elendi',
  participantJoined: 'Katılımcı katıldı',
  participantChanged: 'Katılımcı güncellendi',
  commandRejected: 'Komut reddedildi',
  phaseChanged: 'Aşama değişti',
  roundResult: 'Tur sonucu',
  submissionUpdated: 'Gönderi güncellendi',
  matchupsAnnounced: 'Eşleşmeler açıklandı',
  byeAnnounced: 'Bay geçti',
  overtimeStarted: 'Uzatma başladı',
  drawPerformed: 'Kura çekildi',
  revealStep: 'Gösterim adımı',
  ratingProgress: 'Puanlama ilerledi',
  privateMediaCleanupRequested: 'Özel medya temizliği istendi',
  rematchCreated: 'Rövanş açıldı',
};
