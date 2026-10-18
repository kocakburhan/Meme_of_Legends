# Görev: M3b — Katılımcı ekranlarını sunucuya bağla + ortak ekran

Worker: OpenCode (glm-5.3-flash, max) · Dal: `m3b-wire`

## Oku
AGENTS.md · docs/contracts/protocol.md (v0.2) · apps/server/README.md · packages/engine/README.md · docs/PRODUCT_SPEC.md (Bölüm 5, 7, 13, 16A) · docs/PROJECT_LOG.md Bölüm 3.1, 3.2, 3.5

## Amaç
M3a'daki saf katılımcı ekranlarını gerçek sunucuya (yerel `wrangler dev`) bağlamak ve ortak ekranı yazmak. Bitince yerelde, birden fazla tarayıcıda gerçek bir oyun oynanabilmeli.

## Kapsam
1. **Ağ katmanı** (`apps/web/src/net/`): HTTP istemcisi (oda bilgisi, katılım, cihaz devri isteği ve sonucunu sorgulama, ekran eşleştirme) ve WebSocket istemcisi (protokol v0.2: `view`/`ack`/`cue`/`pong`/`recovery`/`closed`; `clientMsgId`; üstel yeniden bağlanma; `serverNow` ile saat farkı hesaplama ve geri sayımlar). Mesajlar `@mol/shared` şemalarıyla doğrulanır. Bu katman ileride konsol ve paneller tarafından da kullanılacak; genel tasarla.
2. **Katılımcı akışı:** `/` kod girişi → `/oda/:code` katılım → token tarayıcıda saklanır (aynı tarayıcı aynı kimlik) → canlı `view`'a göre doğru ekran. Komutlar: `select`, `confirm`, `rate`, `finishReview`, `leaveToVoter`, `changeNickname`. `closed` nedenlerine göre durum ekranları; `recovery` → "Devam ediyoruz 3-2-1".
3. **Cihaz devri:** takma ad kullanımdaysa "Sen misin? Yöneticiden devam onayı iste" akışı.
4. **Ortak ekran** (`/ekran`): eşleştirme kodu girişi → token → büyük "Ekranı başlat" (ses kilidi + tam ekran) → 16:9 sahne: lobi (büyük QR + oda kodu + katılımcılar), seçim (büyük durum, geri sayım, eşleşmeler ve hazır işaretleri), gösterim (büyük gönderi, süre çubuğu, son karar, canlı oy sayacı), final gözden geçirme (küçük resimler + bitiren sayısı), sırayla açıklanan sonuçlar, geçişler, oyun sonu. Köşede sürekli küçük QR + oda kodu + seyirci sayısı. QR üretimi istemci tarafında bir kütüphaneyle.
5. **Ses kuralları** (spesifikasyon 13.2): ortak ekran varsa sesi yalnız o çalar, telefonlar sessiz + "Sesi aç".
6. **Motor görünümüne küçük eklemeler (onaylı):** `View`'e gösterim konumu (`index`/`total`) ve katılımcının kendi gönderisinin kimliği (`ownSubmissionId`) eklenebilir. Yalnız `packages/engine/src/projection.ts` + tipleri; mevcut testler korunur, yeni alanlar için test eklenir. Başka motor değişikliği yapma.
7. **M3a düzeltmeleri:**
   - Gösterim ekranında hiyerarşi ters: **durum metni** büyük başlık olmalı (ekranın en baskın metni), "Gönderi 4 / 8" küçük bilgi satırı. Aynı ilke seçim ve final gözden geçirme ekranlarında da geçerli.
   - Gösterimde meme alanı, 390×844 ve 360×740'ta 1–5 puan düğmeleri kaydırmadan görünecek yükseklikte olmalı.
   - Yazım hatası: "Eldin!" → **"Elendin!"** (StatusScreens ve önizleme).
   - Yer tutucu medya emoji yerine nötr bir çizim/simge olsun; gerçek medya için `src` alanı (sistem meme'leri R2 URL'si; YouTube gizlilik modlu oynatıcı M6'da, şimdilik yer tutucu).
8. **Uçtan uca test (Playwright):** yerel sunucu + web; bir test yardımcısı API ile işletme ve lobi oluşturup yönetici WebSocket'iyle oyunu başlatır (konsol arayüzü M4'te). En az: 3 oyuncu + 1 seyirci + ortak ekran ile lig modunda 1 turluk tam oyun; yeniden bağlanma; geç katılan seyircinin puanlayamaması.

## Kapsam dışı
Yönetici konsolu arayüzü (M4), işletme/admin panelleri, yükleme/YouTube işlevi (M6), uzak Cloudflare işlemleri, `docs/` değişikliği.

## Bitti tanımı
- `pnpm verify` geçer; Playwright testleri (`pnpm test:e2e`) geçer.
- 320–430 px telefon ve 1280×720 ortak ekranda düzen bozulmaz.
- Dalda mantıklı commit'ler. Push yok. Uzun süre çalışan sunucu bırakma.

## Teslim
Kısa özet, açık sorular.
