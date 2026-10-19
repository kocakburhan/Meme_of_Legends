# Görev: M5c — Admin paneli (web)

Worker: OpenCode (M5c-1/2: glm-5.3-flash max; M5c-3: deepseek-v4.1-flash max) · Dal: `m5c-admin`

## Oku
AGENTS.md · **docs/contracts/admin-api.md** · `packages/shared/src/admin.ts` (şemalar) · docs/PRODUCT_SPEC.md Bölüm 2.1, 3, 6.1–6.2, 12.3, 15, 16A · docs/PROJECT_LOG.md Bölüm 3.4 (admin paneli; "Linkten ekle"/panelden yükleme maddeleri **geçersiz**: M5 kararıyla meme ekleme yerel araçtadır, bkz. log sonu) · M4c'nin işletme paneli (`apps/web/src/panel/`, `pages/Business*`, `net/http.ts`) — aynı kalıpları kullan.

## Amaç
Platform admin'inin her şeyi yönettiği paneli yazmak: masaüstü öncelikli, telefonda da eksiksiz çalışır; görsel dil nötr, sade, esprisiz (Gece Şovu renk belirteçleri, sakin).

## Kapsam
Rotalar `/admin/...`; giriş `/admin/giris` (`POST /api/auth/admin/login`), oturum düşerse `?next=` ile girişe. Yan menü (masaüstü) / üst menü veya çekmece (telefon). Tüm yanıtlar `@mol/shared` admin şemalarıyla doğrulanır. Yükleniyor / boş / hata durumları Türkçe. Yıkıcı işlemler (sonlandır, pasife al, şifre sıfırla, iade) onay ister.

1. **Genel bakış** (`/admin`): aktif oturumlar (işletme, oda, durum → detaya), az platform durumu uyarısı (`/prompts/health`), etiketlenmemiş meme sayısı (→ hızlı etiketleme), son hatalar. Grafik yok.
2. **İşletmeler:** liste (arama, aktif/pasif filtresi); **kısa formla aç** (ad, kullanıcı adı, başlangıç hakkı, önerilen şifre değiştirilebilir) → giriş bilgisi özeti + "Kopyala"; detay: kullanım özeti, hak ekle/çıkar, sınırsız hak, eşzamanlı oturum sınırı, lobi ömrü, aktif/pasif, şifre sıfırla (yeni geçici şifre + kopyala), **adına giriş** (başarıda `loginUrl` yeni sekmede), işletmenin oturumları (→ oturum detayı) ve durumları (→ işletme durumu denetimi filtreli).
3. **Oturumlar:** liste (işletme, durum, tarih filtresi, imleç); detay: SPEC 15.4 alanları (rapor JSON'unu okunur bölümlere dök: katılımcılar, turlar ve durum metinleri, sonuçlar/sıralama, gizlemeler, çıkarmalar, duraklatmalar, hatalar, admin müdahaleleri), **Sonlandır** (aktifse), **Hakkı iade et** (uygunsa). İşletme bazında kullanım sayfası.
4. **İçerik:**
   - **Kategoriler:** ekle, yeniden adlandır, sırala (yukarı/aşağı yeterli), arşivle/geri al.
   - **Platform durumları:** liste (arama, durum filtresi, imleç), metin olarak ekle (3–160 karakter canlı sayaç), düzenle, arşivle/geri al; tekrar → "zaten var" + arşivdeyse "Yeniden etkinleştir"; az durum uyarısı.
   - **İşletme durumları:** liste (işletme, metin araması, engelli filtresi), engelle / engeli kaldır. Metin düzenlenemez.
   - **Meme kütüphanesi:** ızgara/liste (arama, kategori, durum), gerçek önizleme (resim/GIF `<img>`, video `<video>` kapaklı), kategori/açıklama düzenle, arşivle/geri al. Panelde ekleme yok: "Meme eklemek için yerel aracı kullanın: `pnpm media add <link>`" bilgisi.
   - **Hızlı etiketleme** (`/admin/icerik/etiketle`): en eski etiketlenmemiş meme'i büyük önizlemeyle getirir; kategori, açıklama, kaynak link (yeni sekmede); "Kaydet ve sıradakine geç" (`active` yapar), "Atla", "Arşivle"; klavye kısayolları (ör. Ctrl/⌘+Enter kaydet, 1–9 kategori seçimi, Esc atla) ekranda yazılı. Kuyruk boşsa "Etiketlenecek içerik kalmadı".
5. **Sistem:** hata kayıtları ve admin işlem kaydı listeleri (filtre + imleç).
6. **Medya yüklenemezse:** `MemeFrame` kırık resim simgesi göstermesin; SPEC 12.3 gereği bir kez yeniden dener, olmazsa sade "Bu cihazda yüklenemedi" yer tutucusu (katılımcı, ortak ekran, konsol, admin hepsinde).
7. **E2E tohum:** `apps/e2e/global-setup.ts` tohum meme'lerine gerçek küçük dosyalar koysun (yerel R2'ye `wrangler r2 object put mol-media/<anahtar> --local --file …`, anahtarlar `memes/` önekiyle; medya ucu yalnız bu öneki sunar). Dosyaları test içinde üret ya da depoya küçük PNG/GIF ekle.
8. **E2E:** admin girişi → işletme aç → bilgiler kopyalanır → işletme detayında hak ekle → adına giriş yeni sekmede işletme paneli açılır; platform durumu ekle/tekrar/arşivle; işletme durumunu engelle; kategori ekle; etiketlenmemiş bir meme (API ile multipart yükleyerek) hızlı etiketlemede kaydedilir ve oda kütüphanesinde görünür; aktif bir oturumu sonlandır + iade. Mevcut e2e'ler geçmeye devam eder.

## Kapsam dışı
Sunucu/motor/shared değişikliği (gerekirse dur ve özetinde yaz; küçük bir hata düzeltmesi gerekiyorsa açıkça belirt). Yerel medya aracı. Uzak Cloudflare. `docs/` değişikliği.

## Bitti tanımı
- `pnpm verify` ve `pnpm --filter @mol/e2e test:e2e` geçer; 390×844 ve 1280×800'de düzen bozulmaz.
- Dalda mantıklı commit'ler. Push yok. Arkada süreç bırakma. Asla çözülmeyen beklemeler (`new Promise(r => r)` vb.) kullanma.

## Teslim
Kısa, doğru özet (uydurma yok), açık sorular.

## Parçalar
glm-5.3-flash uzun işlerde bağlamı kaybettiği için iş üç ayrı oturumda yapılır; her oturum yalnız kendi parçasını yapar, `pnpm verify` + ilgili e2e'yi geçirir ve commit atar.
- **M5c-1:** giriş, düzen/menü, Genel bakış (madde 1), İşletmeler (madde 2), madde 6 (medya yer tutucusu), madde 7 (tohum) + bunların e2e'si.
- **M5c-2:** İçerik (madde 4) + e2e.
- **M5c-3:** Oturumlar ve kullanım (madde 3), Sistem (madde 5) + kalan e2e.
