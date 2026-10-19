# Sözleşme: Özel içerik (M6a)

Görev kapsamında protokol ve `custom_uploads` sahiplik alanları genişletilmiştir. Motor API'si değişmez. Şemalar `packages/shared/src/index.ts` içindedir.

## Kimlik ve erişim

Tüm uçlar `/api/rooms/:code/custom/` altındadır. Katılımcı kimliği mevcut oda token'ıyla taşınır: `Authorization: Bearer …`, `mol_participant_:code` HttpOnly çerezi veya mevcut `?token=…` biçimi. Token, oturum/oda, güncel cihaz yetkisi ve çıkarılma durumu üzerinden doğrulanır. Yönetici için odanın işletme oturumu; ortak ekran için güncel eşleştirme token'ı kullanılır. Platform admini doğrudan bu medya uçlarına erişmez.

`previewUrl` aynı kökende bir adres döndürür. Tarayıcıdaki `<img>` mevcut katılımcı/işletme çerezini gönderir; özel anahtar ve imzalı bir genel erişim yetkisi dağıtılmaz. Ortak ekran, Bearer ile dosyayı alıp blob URL oluşturabilir; mevcut sorgu token'ı da desteklenir. Token içeren URL paylaşılmamalıdır. Yanıtlar `Cache-Control: private, no-store` ve `X-Content-Type-Options: nosniff` taşır. Her GET/HEAD güncel yetkiyi tekrar kontrol eder. R2 anahtarları UUID içerir ve genel `/media/` yolundan sunulmaz.

Seçimde dosya yalnız sahibi ve oda yöneticisine açılır. WebSocket görünümünde diğer katılımcılara/ekrana özel içerik referansı sızmaz. Mevcut yönetici `view.submissions[].playerId`, `view.participants[].nickname` ile eşleştirilerek canlı listeyi oluşturur; `rejectCustom` ve `hideCurrent` mevcut motor komutlarıdır. Gösterim sırası gelmiş, gizlenmemiş/geçersiz olmayan içerik odanın aktif katılımcılarına ve eşleşmiş ekranına açılır; sıradaki içerikler erken açılmaz. Henüz gönderilmemiş yüklemeler de sahibine ve yöneticiye önizleme için açıktır. Oturum bitince erişim kapanır.

## Uçlar

| Uç | İstek | Başarı |
|---|---|---|
| `POST uploads` | Ham dosya gövdesi; `Content-Type: image/jpeg`, `image/png`, `image/webp` veya `image/gif` | 201 `{ uploadId, mediaType: 'image' \| 'gif', previewUrl }` |
| `GET/HEAD uploads/:uploadId` | Oda kimliği | 200 dosya; yetkisiz dosya 404 |
| `POST youtube` | JSON `{ url }` | 200 `{ videoId, durationMs: null }` |
| `POST errors` | JSON `{ submissionId }` | 200 `{ ok: true }` |

Yükleme ve YouTube doğrulama yalnız çalışan oyunun açık seçim aşamasında, o turda gönderi yapabilen aktif oyuncuya ve turun `customContent` ayarı açıkken izinlidir. Duraklatma, toparlanma ve süre dolması engellenir. Yükleme onayı seçim/gönderi onayı değildir.

Ham gövde akış sırasında da 10 MiB ile sınırlandırılır; MIME ve dosya imzası eşleşmelidir. Saf TypeScript ayrıştırıcı JPEG APP/yorum segmentlerini (görüntüleme için JFIF/Adobe başlıkları hariç), PNG yardımcı meta verilerini, WebP EXIF/XMP/ICC ve bilinmeyen chunk'larını, GIF yorum/uygulama uzantılarını temizler. GIF'in yalnız kanonik döngü talimatı korunur; kareler ve animasyon kontrolü korunur. Bu işlem piksel kod çözücü veya transcode değildir. Kayıt anahtarı `custom/<sessionId>/<uploadId>.<ext>`.

YouTube için watch, youtu.be, shorts, embed biçimleri ve 11 karakterlik kimlik kabul edilir. Sabit YouTube oEmbed adresine 5 sn zaman aşımıyla istek yapılır; istemcinin verdiği sunucu adresine ağ isteği yapılmaz. oEmbed'in olumlu sonucu 60 sn oturum içinde önbelleklenir; bu, YouTube'un kamuya açık gömülebilirlik sinyalidir. oEmbed süre döndürmediğinden `durationMs` **null** olur; M6b süreyi IFrame oynatıcıdan okumalıdır. YouTube erişim/yaş/bölge koşulları sonradan veya cihaza göre değişebilir; yükleme hatası bildirimi oyun akışını durdurmaz.

`select` için YouTube doğrulama ucu atlanamaz: sunucu olumlu önbelleği arar, yoksa oEmbed'i doğrular. `startMs`, `endMs` tam sayı ve negatif olmayan başlangıçla `1 <= endMs - startMs <= 25000` olmalıdır. Upload kimliği oyuncuya, güncel oturuma ve medya türüne ait olmalıdır. Mevcut `ack { ok, reason }` kullanılır.

Hata bildiriminin gönderisi bildirenin mevcut projeksiyonunda medya ile görünmelidir. Sunucu medya türünü kendisi bulur. `error_log`: `source='media'`, `code='MEDIA_LOAD_FAILED'`, oturum ve `{ submissionId, mediaType }`; dosya URL'si, upload/video kimliği ve istemci hata metni yazılmaz.

## Hatalar ve hız sınırları

HTTP hataları mevcut `{ error: { code } }` biçimindedir.

| Kod | HTTP | Anlam |
|---|---|---|
| `CUSTOM_CONTENT_DISABLED` | 409 | Turda özel içerik kapalı |
| `CANNOT_SELECT`, `RECOVERING` | 409 | Oyuncu şu anda gönderi yapamaz |
| `CUSTOM_MEDIA_INVALID` | 422 | Tür, imza veya dosya yapısı uygun değil |
| `CUSTOM_MEDIA_TOO_LARGE` | 413 | 10 MiB sınırı aşıldı |
| `CUSTOM_UPLOAD_NOT_FOUND` | select ack | Yükleme bu oyuncuya/oturuma/türe ait değil |
| `YOUTUBE_INVALID_URL` | 422 | Desteklenmeyen bağlantı veya video kimliği |
| `YOUTUBE_NOT_EMBEDDABLE` | 422 | Gömme engelli; oEmbed 401/403 veya geçersiz gömme yanıtı |
| `YOUTUBE_NOT_PUBLIC` | 422 | oEmbed 400/404: özel, silinmiş veya bulunamayan video |
| `YOUTUBE_UNAVAILABLE` | 503 | Ağ, zaman aşımı veya geçici YouTube hatası |
| `RATE_LIMITED` | 429 | Hız sınırı |

Mevcut `INVALID_REQUEST`, `JSON_REQUIRED`, `INVALID_TOKEN`, `FORBIDDEN`, `NOT_FOUND`, `METHOD_NOT_ALLOWED` kodları da geçerlidir. oEmbed özel/silinmiş durumları birbirinden kesin ayıramadığı için ortak hata döner. Şemaya uymayan `select` (video kimliği/kırpma dahil) `INVALID_COMMAND` ack alır.

DO kalıcı deposunda kayan 60 sn penceresi: oyuncu başına 6 yükleme denemesi, 10 gerçek YouTube ağ doğrulaması; kimlik başına 10 geçerli medya hata bildirimi. Önbellek isabeti YouTube kotası tüketmez. Yeniden bağlantı hız sınırını sıfırlamaz.

## Silme ve migration

`0003_unique_rattler.sql`: `custom_uploads.participant_id`, `media_type` eklenir; eski satırlarla uyumluluk için nullable, yeni yazımlarda ikisi de zorunlu sağlanır. Motor bitişte özel medya referanslarını zaten siler; raporda yalnız `customType` kalır.

Oyun tamamlanması/sonlandırılması, dışarıdan kapatma (iptal/admin sonlandırma) ve lobi zaman aşımı R2 nesnelerini, ardından DB satırlarını siler. Kalıcı geçiş niyeti silme başarısızlığında yeniden oynatılabilir; YouTube doğrulama anahtarları da kaldırılır. Mevcut 10 dakikalık Cron, terminal oturumların kalmış satırlarını ve nesnelerini süpürür; DB yazımından önce çökmeden kalabilecek, bir saatten eski sahipsiz `custom/` nesnelerini de toplar. Canlı oturumların seçilmemiş yüklemeleri oturum sonuna kadar tutulur. Uzak kaynak değişikliği gerekmez.
