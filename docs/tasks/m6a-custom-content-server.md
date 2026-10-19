# Görev: M6a — Özel içerik (sunucu + protokol)

Worker: Codex (gpt-6.1-sol, medium) · Dal: `m6a-custom-server`

## Oku
AGENTS.md · docs/PRODUCT_SPEC.md Bölüm 7.1, 7.2, 12.3, 12.5, 14.2, 16 · docs/PROJECT_LOG.md 8.6, 8.21 · docs/contracts/protocol.md, engine-api.md (MediaRef: `upload` / `youtube`; `rejectCustom`, `hideCurrent`), db-schema.md (`custom_uploads`, `error_log`) · apps/server/src/room.ts, rooms.ts, media.ts

## Amaç
Oyuncuların seçim aşamasında kendi resim/GIF'lerini yükleyip YouTube klibi seçebilmesi için sunucu tarafını eksiksiz yapmak; içerik oturum sonunda silinir. Motor kuralları zaten var; motor değişikliği gerekirse yalnız küçük ve testli.

## Kapsam
1. **Resim/GIF yükleme ucu** (katılımcı kimliğiyle; mevcut katılımcı token'ı nasıl taşınıyorsa): yalnız ayar `customContent` açıkken, oyuncu seçim aşamasındayken ve gönderi yapma hakkı varken. JPG, PNG, WebP, GIF; ≤ 10 MB; dosya imzası doğrulanır. **EXIF/konum ve diğer meta veriler silinir** (Worker'da saf TS ile: JPEG APP1/APP13 vb. segmentler, PNG `tEXt/iTXt/zTXt/eXIf`, WebP `EXIF/XMP` chunk'ları; GIF yorum/uygulama uzantıları — animasyon korunur). Çıktı `custom_uploads` kaydı + R2 `custom/<sessionId>/<uploadId>.<ext>`. Yanıt: `uploadId`, `mediaType`, önizleme adresi. Oyuncu başına makul hız sınırı.
2. **YouTube doğrulama ucu:** link → video kimliği (watch, youtu.be, shorts, embed biçimleri); herkese açık ve gömülebilir olduğu doğrulanır (ör. oEmbed; gömme kapalı/özel/silinmiş → net hata kodu). Süre bilgisi alınabiliyorsa döner (kırpma arayüzü için); alınamıyorsa istemci oynatıcıdan okur — seçimini sözleşmeye yaz.
3. **`select` doğrulaması (oda):** `upload` medyası yalnız o oyuncunun o oturumdaki yüklemesi olabilir; `youtube` için kimlik biçimi ve `endMs - startMs` 1–25 000 ms. Ayar kapalıysa reddedilir. Mevcut ack/reason biçimi.
4. **Görünürlük (SPEC 7.1):** seçim boyunca özel içerik yalnız sahibine ve yöneticiye görünür (yönetici görünümü gönderen adıyla canlı liste — mevcut değilse projeksiyona ekle; sızıntı testleri). Gösterimde herkes anonim gönderi olarak görür.
5. **Özel medya sunumu:** tahmin edilemeyen anahtarlar; genel uzun önbellek **yok** (oturum sonunda silinecek); Range desteği resim için gerekmez. Seçimde yalnız sahibi ve yönetici, gösterimden sonra odadakiler erişebilsin istenir; `<img>` başlık taşıyamadığı için yaklaşımı (imzalı kısa ömürlü URL, oda/katılımcı çerezi vb.) sen seç ve gerekçelendir.
6. **Oturum sonunda silme (SPEC 16):** oyun bitince / iptal / sonlandırma / lobi süresi dolunca R2 nesneleri ve `custom_uploads` satırları silinir (rapor yalnız tür bilgisini tutar — mevcut). Bir şey kaçarsa diye periyodik süpürme (ör. DO alarmı ya da Cron Trigger; Cron eklersen `wrangler.jsonc`'ye yaz, uzak işlem yapma).
7. **Medya hata kaydı (SPEC 12.3):** istemcinin "bu cihazda yüklenemedi" bildirimi için hafif bir mesaj/uç → `error_log` (oturum, gönderi, medya türü; özel içerik URL'si yazılmaz). Hız sınırı.
8. **Sözleşmeler:** `docs/contracts/protocol.md` ve gerekiyorsa yeni `docs/contracts/custom-content.md` (uçlar, hata kodları, görünürlük kuralları). Şemalar `packages/shared`'da.

## Kapsam dışı
Web arayüzü (M6b; yalnız şema/sözleşme hazırla). Uzak Cloudflare işlemleri. Platform meme hattı.

## Bitti tanımı
- Sunucu testleri: tür/boyut/imza reddi, EXIF temizliği (konum içeren örnek JPEG'den GPS gider; PNG/WebP/GIF meta), ayar kapalı reddi, başkasının `uploadId`'si reddi, YouTube kimlik ayrıştırma ve gömülemez/özel durumları (ağ sahte), seçimde sızıntı yok, gösterimde erişim var, oturum sonunda R2 + DB temizliği, hata kaydı.
- `pnpm verify` geçer; mevcut e2e (`pnpm --filter @mol/e2e test:e2e`) bozulmaz. 8787/5173'ü kullanabilirsin; açtığın süreçleri kapat.
- Commit at (yazamıyorsan bırak, orchestrator atar); push yok.

## Teslim
Kısa özet: uçlar, görünürlük/erişim yaklaşımı, silme yolu, şema/migration değişiklikleri, açık sorular.
