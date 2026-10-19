# Meme of Legends — Uygulama Planı

- **Sürüm:** v1 taslak, 2026-10-18
- **Kaynaklar:** `docs/PRODUCT_SPEC.md` (ne yapılacak), `docs/PROJECT_LOG.md` (neden ve teknik kararlar, Bölüm 3–4).
- **Çalışma modeli:** Claude Code orchestrator; Codex ve OpenCode worker. Owner gerektiğinde roller değiştirir.

---

## 1. İlkeler

1. **Önce motor.** Oyunun doğruluğu `packages/engine` içinde, ağdan ve Cloudflare'den bağımsız olarak kurulur ve testlerle kilitlenir. Diğer her şey motorun etrafına yerleşir.
2. **Sözleşme önce gelir.** Paralel çalışmadan önce ortak arayüzler (motor API'si, WebSocket protokolü, veritabanı şeması) yazılı ve tiplenmiş hale getirilir. Worker'lar bu sözleşmelere göre bağımsız ilerler.
3. **Her iş "bitti" tanımıyla verilir.** Orchestrator her işi; amacı, kapsamı, ilgili spesifikasyon bölümleri ve geçmesi gereken testlerle birlikte tanımlar. Bitti = testler geçer + orchestrator incelemesi onaylar.
4. **Küçük ve birleştirilebilir parçalar.** Her iş tek bir dalda (git worktree) yapılır, kısa ömürlüdür ve ana dala orchestrator incelemesinden sonra girer.
5. **Belirsizlikte uydurma yok.** Spesifikasyonda karşılığı olmayan bir ürün kararı gerekirse worker durur ve orchestrator'a sorar; orchestrator gerekirse owner'a taşır ve kararı kayda geçirir.

---

## 2. Aşamalar

### M0 — Kurulum
- Owner: GitHub hesabı + gizli repo, Cloudflare hesabı (orchestrator adım adım rehberlik eder).
- Monorepo iskeleti (pnpm workspaces), TypeScript, lint/format, Vitest, Wrangler yapılandırması (Pages, Workers, DO, D1, R2).
- **GitHub Actions kullanılmaz** (owner kararı, 2026-10-18). Kalite kapısı yerel `pnpm verify`; orchestrator her birleştirmeden önce çalıştırır. Yayın orchestrator tarafından yerelden `wrangler` ile yapılır.
- **Bitti:** boş uygulamalar yerelde ayağa kalkar; `pnpm verify` geçer; D1 (`mol-db`) ve R2 (`mol-media`) oluşturulmuş.

### M1 — Oyun motoru (`packages/engine`)
- Önce orchestrator motor API'sinin taslağını (durum, komutlar, olaylar, saat/rastgelelik enjeksiyonu) yazar.
- Kapsam: oturum ve tur durum makinesi, seçim/gösterim/final gözden geçirme/sonuç aşamaları, puanlama ve puanlama yetkisi (düello kuralı ve istisnası, geç katılım), eleme (eşleşme, bay, sıralama), lig, hibrit (lig aşaması, paralel yarı final, final, sıralama), beraberlik (hesap → uzatma turu → kura, toplu uzatma), ayrılma/atılma/hükmen galibiyet, <2 oyuncuda bitiş, gizlenen içerik telafisi, durum havuzu çekimi ve değiştirme, duraklatma, jüri ödülleri, sonuç açıklama sırası.
- **Bitti:** spesifikasyonun her oyun kuralı için test; 2–64 oyuncu arası binlerce rastgele simülasyon oyunu takılmadan ve tutarlı sonuçla biter; motor saf (I/O yok).

### M2 — Sunucu çekirdeği (`apps/server`, `packages/shared`)
- WebSocket protokolü (`packages/shared`): mesaj tipleri ve doğrulama.
- Oda Durable Object'i: motoru sarar; bağlantılar (Hibernation), alarm tabanlı zamanlayıcılar, kalıcı durum, yeniden bağlanma, cihaz devri, tekrarlı/geç komutlar, sunucu yeniden başlarsa otomatik devam.
- D1 şeması: işletmeler, haklar ve imtiyazlar, oturumlar, durumlar, meme kütüphanesi, raporlar, admin işlem kaydı.
- Kimlik: admin hesabı (komutla oluşturma), işletme girişi ve şifreler, katılımcı token'ı, ortak ekran eşleştirme.
- **Bitti:** Workers yerel ortamında; motor üzerinden tam bir oyun WebSocket istemcileriyle oynanabilir; yeniden bağlanma ve yeniden başlatma testleri geçer.

### M3 — Katılımcı ve ortak ekran (`apps/web`)
- "Gece Şovu" tema token'ları ve temel bileşenler.
- Katılım, lobi, seçim (kütüphane), gösterim ve puanlama, final gözden geçirme, sıralı sonuç açıklama, geçişler, oyun sonu, durum ekranları; ses kuralları.
- Ortak ekran: tüm aşamalar, eşleştirme kodu, "Ekranı başlat".
- **Bitti:** Playwright ile birden fazla tarayıcıda (oyuncular + seyirci + ortak ekran) sistem meme'leriyle tam bir oyun oynanır.

### M4 — Yönetici konsolu ve işletme paneli
- Konsol: durum çubuğu, Oyun / Katılımcılar / Ayarlar sekmeleri, aşamaya göre kartlar, onaylar, "Hemen gizle" (basılı tutma), rövanş.
- İşletme paneli: giriş, ana sayfa, Durumlarım, Geçmiş, Hesap.
- **Bitti:** bir işletme girip oyun açabilir, yönetebilir, rövanş yapabilir; uçtan uca test geçer.

### M5 — Admin paneli ve içerik hattı
- Admin paneli: genel bakış, işletmeler (imtiyazlar, adına giriş, pasife alma, şifre sıfırlama), oturumlar (rapor, sonlandırma, hak iadesi), kategoriler, platform durumları, işletme durumu denetimi, hata ve işlem kayıtları.
- Medya hattı: owner'ın bilgisayarında çalışan yerel komut satırı aracı (`tools/media`; yt-dlp + ffmpeg): linkten/dosyadan/klasörden/link listesinden ekleme, dönüştürme, kapak görseli, video kesme, admin API'si üzerinden yükleme. Sunucu medyayı R2'den sunar. Panelde etiketlenmemiş kuyruğu ve hızlı etiketleme.
- **Bitti:** admin yerel araçla bir X/Instagram/YouTube linkinden meme ekler ve meme oyunda gerçek medyasıyla görünür; 50 linklik toplu içe aktarma kuyruğa düşer, indirilemeyenler raporlanır; platform durumları panelden eklenir.

### M6 — Özel içerik
- Resim/GIF yükleme (boyut/biçim doğrulama, EXIF temizleme), YouTube linki doğrulama ve kırpma, gizlilik modlu oynatıcı.
- Konsolda canlı özel içerik listesi ve reddetme; gizleme telafisi; oturum sonunda silme.
- **Bitti:** özel içerikli tam oyun uçtan uca test edilir; oturum sonunda dosyalar silinir.

### M7 — Sertleştirme ve yayın
- 100 sanal katılımcılı yük testi ve aşama senkron ölçümü (MVP hedefi; gerçek Cloudflare üzerinde).
- Erişilebilirlik denetimi (otomatik + klavye + azaltılmış hareket).
- Veri saklama işleri: takma ad anonimleştirme (7 gün), lobi ve terk edilmiş oyun kapanışları.
- Raporlar, hata kaydı, canlı ortam yapılandırması.
- **Bitti:** canlı ortamda gerçek bir pilot etkinlik oynanabilir.

### İçerik (owner, paralel)
- İlk platform durumları seti (~100+), kategori listesi.
- M5 bitince arşivin toplu içe aktarılması ve etiketlenmesi.

---

## 3. Paralellik ve iş dağılımı

| Dönem | Worker A | Worker B |
|---|---|---|
| M0 sonrası | M1 motor | M3 için tema, bileşenler ve sahte (mock) verili ekranlar |
| M1 sonrası | M2 sunucu | M3 ekranlarının protokole bağlanması |
| M2 sonrası | M5 medya hattı | M4 konsol ve işletme paneli |
| Sonra | M6 | M5 admin paneli |
| Son | M7 (birlikte) | |

- Hangi worker'ın hangi işi alacağı ve kullanılacak modeller iş başında owner'ın belirttiği modellere göre kesinleşir.
- Her iş ayrı dalda yapılır; orchestrator inceler, testleri çalıştırır ve birleştirir.
- Sözleşme dosyaları (motor API'si, protokol, şema) yalnız orchestrator onayıyla değişir.

---

## 4. Orchestrator iş tanımı şablonu

Her iş worker'a şu başlıklarla verilir:
- **Amaç:** tek cümle.
- **Kapsam / kapsam dışı.**
- **İlgili spesifikasyon bölümleri.**
- **Sözleşmeler:** dokunulacak ve dokunulmayacak arayüzler.
- **Bitti tanımı:** geçmesi gereken testler ve gözle kontrol edilecekler.
- **Teslim:** dal adı; kısa özet (ne yapıldı, ne yapılmadı, açık sorular).
