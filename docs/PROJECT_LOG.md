# Meme of Legends — Proje Karar ve Tartışma Kaydı

Bu dosya, owner ile orchestrator (Claude Code) arasındaki tartışmaların ve alınan kararların yaşayan kaydıdır. Konuşma bağlamına bağlı kalmamak için her oturumda güncellenir.

- **Başlangıç:** 2026-10-17
- **Durum:** Tartışma aşaması — henüz kod yok

---

## 1. Çalışma Modeli (Karara bağlandı)

| Rol | Kim | Görev |
|---|---|---|
| Owner | Kullanıcı | Ürün vizyonu, son karar |
| Orchestrator | Claude Code | Owner ile iletişim; işi anlama, kurgulama, planlama, yönetme; worker'lara iş dağıtma ve çıktıları denetleme |
| Worker | Codex | Orchestrator'ın verdiği işleri uygular |
| Worker | OpenCode | Orchestrator'ın verdiği işleri uygular |

- Proje tamamen coding agent'lar ile geliştirilecek.
- **İstisna:** Bazen Codex orchestrator, OpenCode worker olabilir. Owner bunu açıkça belirtir.
- **Model seçimi:** Codex ve OpenCode'da kullanılacak modeli owner söyler. Owner aksini söyleyene kadar orchestrator o modeli tekrar sormadan kullanır.
  - **Codex** (zor işler): `gpt-6.1-sol`, reasoning **low veya medium** — `codex exec -m gpt-6.1-sol -c model_reasoning_effort=low|medium "..."`
  - **OpenCode** (görece kolay ve normal işler): `glm-5.3-flash`, reasoning **max** — `opencode run -m 'opencode-go/glm-5.3-flash#max' "..."`
  - Owner modelleri ve reasoning seviyelerini ileride değiştirebilir. (2026-10-18; iki komut test edildi, çalışıyor.)
- **AGENTS.md / CLAUDE.md:** Tartışmalar bittikten sonra yazılacak. Kısa tutulacak; sıkı talimatlar yerine modellere ve harness'lere özgürlük tanıyacak.

---

## 2. Ürün Tanımı

Ürün bir **oyun**: işletmelerin (kafe, bar, üniversite, şirket, etkinlik organizatörü) düzenlediği, tarayıcıda oynanan, canlı bir meme yarışması. Katılımcılar QR/oda koduyla hesapsız katılır; verilen duruma ("Maaşın yattığı an") en uygun meme'i seçer, gönderiler anonim gösterilir ve 1–5 puanlanır. Güncel ürün tanımı: **`docs/PRODUCT_SPEC.md`** (v2, owner onaylı). Bu dosya kararların gerekçe ve tarihçesini tutar; spesifikasyon ise kararların birleşik ve uygulanabilir halidir.

> **Eski dokümanların statüsü (owner, 2026-10-17):** `docs/old/` altındaki dosyalar ürünü doğru anlatır. Oradaki kararlar ise eleştirel gözle yeniden değerlendirilecek: mantıksızlık/tutarsızlıklar tartışılıp düzeltilecek, boşluklar kapatılacak, uygulamaya geçilebilir ve açık kapı bırakmayan hale getirilecek. Kesinleşen kararlar bu dosyaya yazılır; tartışmalar bitince `docs/old/` silinir.

---

## 3. Ekranlar ve Kullanıcı Akışları

### 3.1 Katılımcı (telefon) — kararlar
- **Akış iskeleti:** Katılım (QR/kod → takma ad + bilgilendirme → rol seçimi → onay bekleme [ayar açıksa] → lobi) → tur (seçim → gösterim + puanlama → final gözden geçirme → sonuç) → geçişler (elenme, bay, uzatma, kura, final kürsüsü + jüri ödülleri, rövanş) → durum ekranları (duraklatıldı, yeniden bağlanıyor, devam ediyoruz, atıldın, takma ad değiştir, cihaz devri, yüklenemedi) + menü (ses, oyunu bırak).
- **Eşleşmeler görünür:** Eleme ve hibrit düello eşleşmeleri tur başında herkese gösterilir ("Ali – Ayşe"). Gönderiler yine anonim ve karışık sırada gösterilir; sonuçta düellolar yan yana açıklanır. Oyuncunun rakibinin gönderisini (kilitli göründüğü için) tanıması kabul edilir.
- **Seyirci seçim aşamasında:** durum + oyuncuların canlı "hazır" işaretleri ("7/10 oyuncu seçti") görür; isterse kütüphaneye göz atabilir.
- **Puanlama:** 1–5 numaralı, büyük, tek dokunuşla seçilen ve değiştirilebilen düğmeler. Görünüm (emoji vb.) görsel dil aşamasında.

### 3.2 Ortak ekran — kararlar
- Aşamalara göre içerik: lobi (büyük QR + kod, canlı katılımcı adları, seyirci sayısı, mod, tahmini süre); seçim (büyük durum, geri sayım, eşleşmeler + hazır işaretleri); gösterim (durum, büyük gönderi, süre çubuğu, son karar vurgusu, ses); final gözden geçirme (küçük resimler, geri sayım, "18/30 bitirdi"); sonuç; geçişler; oyun sonu. Köşede sürekli küçük QR, oda kodu, seyirci sayısı.
- **Canlı oy sayacı:** Gösterimde "23/30 kişi puan verdi" gösterilir (puan/ortalama gösterilmez).
- **Sırayla açıklama:** Sonuçlar ortak ekranda ve telefonlarda 1–2 sn arayla tek tek açıklanır (düellolar / puanlar), sonra tablo gelir. 15 sn'lik sonraki tur geri sayımı açıklama bittikten sonra başlar.

### 3.3 Yönetici konsolu — kararlar
- **Yapı:** Üstte sabit durum çubuğu (aşama, tur, kalan süre, büyük duraklat/devam, ortak ekran menüsü). Altta 3 sekme:
  - **Oyun:** aşamaya göre değişen tek kart — lobi (mod/ayarlar, tahmini süre, ilk durum önizlemesi, QR paylaşma, Başlat); seçim (özel içerik canlı listesi + Reddet, +15/+30/+60, ilk 15 sn'de Durumu değiştir, hazır sayısı); gösterim (mevcut gönderi + gönderen, oy sayacı, Hemen gizle); final gözden geçirme (bitiren sayısı, Şimdi kapat); sonuç (sonraki durum önizlemesi + Değiştir, Beklet / Hemen geç).
  - **Katılımcılar:** listeler, kişi başına işlemler, bekleyen onaylar (rozetli; asla engelleyici pencere değil).
  - **Ayarlar:** sonraki turlar için süreler, özel içerik, seyirci kabulü ve onay modları, Oyunu bitir.
- Geri alınamaz işlemler (atma, oyunu bitirme) onay ister. Masaüstünde aynı bölümler yan yana sütunlar; cihaza özel yetenek yok.
- **"Hemen gizle": 1 saniye basılı tutma** (düğme dolarak ilerler).

### 3.4 İşletme ve admin panelleri — kararlar
- **İşletme paneli (telefon öncelikli):** Ana sayfa (kalan hak, "Yeni oyun" / "Oyuna dön", eşzamanlı oturum izni varsa liste, son oyunlar); Durumlarım; Geçmiş (oyun özeti); Hesap.
- **Admin paneli (masaüstü öncelikli, telefonda çalışır):** Genel bakış (sayılar ve listeler, grafik yok); İşletmeler (liste, kısa formla açma, detay: hak/imtiyaz, oturumlar, durumlar, pasife alma, şifre sıfırlama, adına giriş); Oturumlar (rapor, sonlandır, hak iade); İçerik (meme kütüphanesi, kategoriler, platform durumları, işletme durumu denetimi); Sistem (hata kayıtları, admin işlem kaydı).
- **"Linkten ekle" (MVP'de):** Admin X / Instagram / YouTube linkini yapıştırır; sistem arka planda indirir (yt-dlp), dönüştürür, Cloudflare'e yükler, ilerleme gösterir. Admin beklerken **kategori** seçer ve **açıklama** yazar; hazır olunca önizleme (25 sn'den uzunsa kesme aracı) ve "Ekle" → doğrudan kütüphanede. İndirilemeyen içerik için net hata.
- **Meme meta verisi:** yalnız **kategori + açıklama** (açıklama hem kart başlığı hem arama metni). Ayrı etiket alanı yok.
- **Toplu içe aktarma:** aynı motor; link listesi (veya dosya klasörü) verilir, hepsi indirilir ve **etiketlenmemiş kuyruğuna** düşer, indirilemeyenler raporlanır. Owner'ın arşivinin ilk aktarımı böyle yapılır; owner'ın ayrı script yazmasına gerek yok.
- **Etiketlenmemiş kuyruğu:** kategori + açıklama girilene kadar oyunda görünmez. Hızlı etiketleme ekranı: büyük önizleme, kategori, açıklama, kaynak link, "Kaydet ve sıradakine geç", klavye kısayolları, gerekiyorsa kesme aracı.
- Panelden çoklu dosya yükleme (sürükle-bırak) de vardır; yüklenenler kuyruğa düşer.
- yt-dlp platform değişikliklerinde güncellenmesi gereken bir bakım kalemidir.

### 3.5 Görsel dil — kararlar
- **Seçilen yön: B · Gece Şovu** (oyun yüzeyleri: katılımcı, ortak ekran, yönetici konsolu). Gerekçe: memeler (çoğu açık zeminli) koyu çerçevede öne çıkar; loş akşam mekânlarında göz yormaz, projektörde sahne hissi verir. Bilinen dezavantaj: aydınlık salonda projektör koyu renkleri soldurabilir.
- Palet (taslak, uygulamada kontrastla doğrulanacak): zemin #121018, yüzey #1E1B26, metin #F5F2EA, vurgu sarı #FFD23F. Yazı: Anton (büyük harf başlık/rakam) + Manrope (metin).
- İşletme paneli: aynı yönün sakin versiyonu. Admin paneli: nötr, sade, esprisiz.
- Ton ve hareket: eski "Esprili ve Asi" ilkeleri korunur (bkz. spesifikasyon Bölüm 21).

## 4. Teknoloji Seçimleri

### 4.1 Ölçek, alan adı ve barındırma (owner, 2026-10-18)
- **Ölçek hedefi:** aynı anda 1–2 oyun (oturum başına 300 katılımcı doğrulama hedefi değişmedi).
- **Alan adı / sunucu:** henüz yok. MVP ücretsiz veya cüzi ücretli çözümle kurulacak; owner ileride VPS alacak.
- **Karar: Cloudflare**
  - Web uygulaması: **Cloudflare Pages** (ücretsiz, `*.pages.dev` alt alan adı).
  - Oyun sunucusu: **Durable Objects** — her oda bir DO; zamanlayıcılar (alarm), WebSocket bağlantıları (Hibernation API), kalıcı oyun durumu (SQLite-backed). Ücretsiz plan.
  - Veritabanı: **D1**. Dosyalar: **R2**.
  - Video indirme/dönüştürme (yt-dlp + ffmpeg): ~~GitHub Actions~~ → **GitHub kullanılmıyor (2026-10-18)**; aday Cloudflare Containers (Workers Paid, ayda 5 $), M5 başında kesinleşecek.
  - Reddedilenler: Firebase (sürekli sunucu yok, okuma kotası), Supabase (ücretsiz ~200 eşzamanlı bağlantı, 7 günde durdurma), Render vb. (uyku), Oracle Free (hesap/geri alma riski).
- **Taşınabilirlik ilkesi:** Oyun motoru Cloudflare'den bağımsız saf modül olarak yazılır; DO yalnız ince bir kabuktur. VPS'e geçişte yalnız kabuk yeniden yazılır.
- **Tahmini maliyet:** 0 TL; isteğe bağlı alan adı ~10 $/yıl; gerekirse 5 $/ay.

### 4.2 Teknik yapı (owner onayı, 2026-10-18)
- **Dil:** her yerde TypeScript.
- **Monorepo:** `packages/engine` (saf oyun motoru; saat ve rastgelelik dışarıdan enjekte), `packages/shared` (protokol ve tipler), `apps/server` (Workers + Durable Objects + D1), `apps/web` (tek SPA, rota bazlı kod bölme), `tools/media` (yt-dlp + ffmpeg işi, GitHub Actions).
- **Web:** React + Vite, Tailwind CSS + shadcn/ui ("Gece Şovu" teması token olarak). Animasyon: CSS + Framer Motion/Lottie gerektiğinde.
- **Sunucu:** Workers + Durable Objects (WebSocket), D1 + Drizzle ORM, şifreler WebCrypto (PBKDF2), katılımcı kimliği imzalı token.
- **Test:** motor için kapsamlı birim + rastgele simülasyon testleri; Workers yerel ortamında sunucu testleri; Playwright çok tarayıcılı uçtan uca testler; 300 sanal katılımcılı yük testi. ~~GitHub Actions CI~~ → yerel `pnpm verify` + orchestrator'ın yerelden yayını.
- **Unity kullanılmaz** (yükleme boyutu, mobil tarayıcı performansı, web içerik/erişilebilirlik desteği, agent verimi). Oyun hissi CSS/Framer Motion/Lottie ile.
- Owner'dan iş başında: GitHub hesabı + repo, Cloudflare hesabı.
- **Hesaplar (2026-10-18):** GitHub hesabı (`kocakburhan`) ve repo (`github.com/kocakburhan/Meme_of_Legends`) mevcut. Cloudflare için owner'ın başka bir projede kullandığı **mevcut hesap** kullanılacak (diğer proje kota tüketmiyor). Tüm kaynaklar `mol-` önekli; agent'lar başka kaynağa dokunmaz (AGENTS.md kuralı).

## 5. Mimari

_Tartışılacak._

## 6. Uygulama Planı ve İş Dağılımı

Plan: `docs/IMPLEMENTATION_PLAN.md` (v1 taslak, owner onayı bekliyor). Aşamalar: M0 kurulum → M1 motor → M2 sunucu → M3 katılımcı + ortak ekran → M4 konsol + işletme → M5 admin + medya hattı → M6 özel içerik → M7 sertleştirme ve yayın. AGENTS.md ve CLAUDE.md yazıldı (kısa, özgürlük tanıyan).

---

## 7. Eski Tasarımın Eleştirel İncelemesi

Orchestrator'ın 2026-10-17 tarihli incelemesi. Her madde: sorun → orchestrator önerisi → durum. Owner karar verdikçe "Durum" güncellenir ve kesin karar ilgili bölüme taşınır.

### A. Oyunun adaletini / işleyişini bozan sorunlar

| ID | Sorun | Öneri | Durum |
|---|---|---|---|
| A1 | **Stratejik oylama.** Oyuncular rakiplerine puan veriyor. Eleme düellosunda rakibe 1 vermek kazandırır. 2 oyuncu + 0 seyirci senaryosunda (eski başarı kriteri) iki oyuncu birbirine 1 verir → hep beraberlik → yönetici karar verir; oyun anlamsızlaşır. Ligde dürüst oy veren oyuncu cezalanır. | Düelloda (eleme eşleşmesi, hibrit yarı final/final) iki rakip birbirinin gönderisini puanlayamaz, diğer gönderileri puanlayabilir. Her düellonun en az 1 tarafsız puanlayıcısı olmalı → 2 oyunculu oyun ancak seyirci varsa başlar (ya da min. oyuncu 3). Ligde oyuncu oyu kalır, risk kabul edilir. | **Karar: Seçenek 1 + jüri ödülü; 2 oyuncu istisnasıyla revize edildi** → Bölüm 8 |
| A2 | **Sahte seyirci ile oy şişirme.** Seyirci sınırsız, hesapsız, onaysız; biri 10 gizli sekme açıp kendine 5 verebilir. | Tarayıcı başına tek katılımcı kimliği; yönetici seyirci listesini görür ve çıkarabilir; "seyirci katılımı açık/kapalı" düğmesi; seyirci sayısı ortak ekranda görünür. Gizli sekme riski kabul edilir. | **Karar: a+b+c+d+e, f opsiyonel** → Bölüm 8 |
| A3 | **Oturum süreleri çok uzun.** Gönderi başına sabit 30 sn. 16 oyunculu bir lig turu ≈ 10,5 dk → 10 tur ≈ 105 dk, 25 tur ≈ 4,4 saat. 16 oyunculu hibrit ≈ 85 dk. Eleme (16) ≈ 25 dk. Statik bir resim için 25 sn de uzun. | Hedef etkinlik süresi belirlensin. Sunum süresi medya tipine göre (resim/GIF kısa, video = klip süresi + son karar). Oluştururken tahmini süre gösterilsin. Lig tur sayısı oyuncu sayısına göre sınırlansın. | **Karar: öneriler onaylandı, süre sınırı yok** → Bölüm 8 |
| A4 | **Beraberlik mekanizması belirsiz ve sık.** Az oyla ortalamada beraberlik sık çıkar. "Favori seçimi"nde ne gösterildiği belli değil (lig toplamında hangi meme?) → popülerlik yarışına döner. | Düello/eleme beraberliğinde **uzatma turu**: yeni durum, kısa seçim süresi, yalnız berabere kalanlar gönderir, diğerleri oylar; yine beraberlik → yönetici. Lig sıralamasında yalnız sonucu etkileyen beraberlikler çözülür (ilk 3, hibrit 4./5. sınırı); diğerleri sırayı paylaşır. | **Karar: tablo + zincir, son adım kura** → Bölüm 8 |

### B. Teknik olarak riskli kararlar

| ID | Sorun | Öneri | Durum |
|---|---|---|---|
| B1 | **TikTok / Instagram / X embed'leri.** Instagram ve X embed'lerinde oynatmayı kontrol eden resmi bir API yok gibi görünüyor (otomatik oynatma, başlangıç/bitiş kontrolü yok). Instagram oEmbed için Meta uygulama onayı gerekiyor. TikTok'ta kontrol kısıtlı. 250 telefonda üçüncü taraf iframe yükü, çerez/onay yükü ve doğrulama ("embed edilebilir mi, yaş kısıtı var mı") zor. | MVP'de dış video kaynağı yalnız **YouTube** (IFrame API başlangıç/bitiş ve kontrol destekliyor). TikTok/IG/X sonraki sürüme. Teknik tasarım aşamasında doğrulanacak. | **Karar: MVP'de yalnız YouTube** → Bölüm 8 |
| B2 | **Ses ve otomatik oynatma.** Aynı klip 250 telefonda ve ortak ekranda aynı anda sesli çalarsa kakofoni olur. Mobil tarayıcılar sesli otomatik oynatmayı engeller. | Ortak ekran varsa ses yalnız orada; telefonlarda sessiz oynar, dokununca ses açılır. Ortak ekran yoksa telefon sessiz başlar, dokununca ses açılır. | **Karar: öneri onaylandı** → Bölüm 8 |
| B3 | **Yönetici 5 sn koparsa oyun duruyor.** Mobilde ekran kilidi, uygulama değiştirme ya da gelen arama bunu sürekli tetikler. Ayrıca sonuç ekranı yönetici "ilerle" diyene kadar bekliyor → yönetici meşgulse (barmen) oyun takılır. | Oyun akışı otomatik ilerlesin. Sonuç ekranı geri sayımla otomatik geçsin; yönetici bekletebilir ya da hemen geçebilir. Yönetici kopması oyunu durdurmasın, yalnız uyarı versin. Yönetici yalnız gerektiğinde (medya hatası, beraberlikte karar) beklenir. | **Karar: öneri onaylandı** → Bölüm 8 |

### C. Mantık boşlukları ve tutarsızlıklar

| ID | Sorun | Öneri | Durum |
|---|---|---|---|
| C1 | En az 25 platform durumu, 25 turluk ligi tekrarsız bitirmek için yeterli sayılmış. Ama her tur 1 "durumu değiştir" hakkı var → 50 durum gerekebilir. | Havuz bitince en eski kullanılan durumlar tekrar kullanılsın; sert "25 altına arşivleme yasak" kuralı yerine uyarı. | **Karar: öneri onaylandı** → Bölüm 8 |
| C2 | Mod, oturum oluşturulurken seçiliyor (varsayılan Hibrit) ama hibritin 4 oyuncu şartı ancak onaylardan sonra belli oluyor. Başlatma anında bekleyen istekler ne olacak, tanımlı değil. | Mod ve ayarlar oyun başlayana kadar değiştirilebilir. "Başlat" butonu kuralları denetler. Başlarken bekleyen istekler seyirci olur. | **Karar: öneri onaylandı (C2'de seyirci şartı hariç) + rövanş** → Bölüm 8 |
| C3 | Hak oluşturma anında düşüyor + tek aktif oturum kuralı + başlatılmayan lobi süresiz kalıyor → hesap kilitlenir ya da hak boşa gider. | Hak **oyun başlatılınca** düşsün. Başlatılmamış lobi X saat sonra otomatik kapansın; yönetici lobiyi her zaman iptal edebilsin. | **Karar: öneri onaylandı (C2'de seyirci şartı hariç) + rövanş** → Bölüm 8 |
| C4 | Eleme modunda bay geçen oyuncu meme gönderiyor mu? Aynı kişiye üst üste bay düşebilir mi? Üçüncülük kuralı yalnız "son dört" turu varsa çalışıyor (ör. 6 ya da 3 oyuncuyla başlanırsa böyle bir tur yok). | Bay geçen oyuncu o tur göndermez, seyirci gibi oy verir. Herkes bir kez bay geçmeden kimse ikinci kez geçmez. Genel sıralama: daha geç turda elenen önde, aynı turda elenenler o turun puanına göre. | **Karar: öneri onaylandı** → Bölüm 8 |
| C5 | Hibritte ilk 4'e giremeyenlerin seyirciye dönüşmesi yazılmamış. Yarı finaller sıralı (9 tur) mı paralel mi belirsiz. 4./5. sıra eşitliği ve ilk 4'ün kendi arasındaki sıralama eşitliği tanımsız. Tam 4 oyuncuda 5 lig turu yalnız sıralama için oynanıyor. | İlk 4'e giremeyenler seyirci olur. Yarı finaller paralel oynanır (4 oyuncu aynı durum, 3 tur) → 11 tur, daha kısa. 4./5. eşitliği → A4; ilk 4 içindeki sıralama eşitliği → kura. | **Karar: öneri onaylandı** → Bölüm 8 |
| C6 | Seçim başladıktan sonra durum değiştirilirse oyuncuların seçimleri ne olur? | Değiştirme yalnız seçimin ilk N saniyesinde yapılabilir; seçimler sıfırlanır, sayaç baştan başlar. | **Karar: öneri onaylandı** → Bölüm 8 |
| C7 | Seyirciyi çıkarma yok. Takma ad moderasyonu yok (küfürlü takma ad ortak ekranda ve tabloda görünür). | Yönetici seyirciyi de çıkarabilir; takma adı değiştirmeye zorlayabilir; takma ad uzunluk sınırı olur. | **Karar: öneri onaylandı** → Bölüm 8 |
| C8 | Çıkarılan oyuncu seyirci mi olur, tamamen mi atılır, tekrar girebilir mi? | İki ayrı eylem: "Seyirciye al" ve "Odadan at" (atılan cihaz geri giremez). | **Karar: öneri onaylandı** → Bölüm 8 |
| C9 | Telefon kapanırsa başka cihazdan devam edilemiyor. Yönetici konsolu ikinci cihazda açılırsa ne olacağı tanımsız. | Aynı takma adla yeni cihazdan gelen istek yönetici onayıyla eski kimliği devralır. Yönetici konsolunda en son açılan cihaz kontrolü alır, eskisi bilgilendirilir. | **Karar: öneri onaylandı** → Bölüm 8 |
| C10 | Ortak ekran açıkken telefonlarda meme gösteriliyor mu? Ortak ekran linkinin güvenliği tanımsız. | Telefonlar her zaman meme'i ve oylamayı gösterir; ortak ekran ek bir yüzeydir. Ortak ekran linki gizli token içerir; yeni açılan eskisini düşürür. | **Karar: öneri onaylandı** → Bölüm 8 |
| C11 | İşletme hesabı pasife alınırsa ya da şifresi sıfırlanırsa aktif oturuma ne olur? | Devam eden oturum biter; yeni oturum açılamaz. Şifre sıfırlama diğer yönetici girişlerini düşürür. | **Karar: revize öneri onaylandı** → Bölüm 8 |
| C12 | Yönetici aynı zamanda oyuncu olabilir mi? (Küçük grupta önemli.) | Owner kararı. | **Karar: yönetici oynayabilir; oyuncu onayı varsayılan otomatik** → Bölüm 8 |

### D. İçerik güvenliği ve hukuk

| ID | Sorun | Öneri | Durum |
|---|---|---|---|
| D1 | Özel içerik anonim ve onaysız olarak ortak ekrana düşüyor; kurumsal etkinlikte büyük risk. Yöneticinin "kaldır" yetkisi iş işten geçtikten sonra işe yarıyor. | Seçim sırasında gelen özel içerikler yönetici konsolunda canlı listelenir; yönetici reddedebilir (oyuncuya bildirilir, süre varsa yeniden seçer). Sunum sırasında "hemen gizle" düğmesi olur. Zorunlu onay kuyruğu yok. | **Karar: Açık/Kapalı (varsayılan Açık), canlı liste, hemen gizle** → Bölüm 8 |
| D2 | KVKK: aydınlatma metni, üçüncü taraf embed çerez onayı ve raporlarda takma adların saklanma süresi tanımsız. | Katılım ekranında kısa aydınlatma metni. Rapor verisi için saklama süresi belirlenir. B1 kabul edilirse embed onayı yalnız YouTube için gerekir. | **Karar: öneri onaylandı, takma adlar 7 günde anonimleşir** → Bölüm 8 |

### E. Kapsam

| ID | Sorun | Öneri | Durum |
|---|---|---|---|
| E1 | MVP çok geniş: 4 sosyal sağlayıcı, kırpma, revizyon geçmişli işletme durumları ve admin moderasyonu, sistem video meme'leri, 3 mod, WCAG AA, 250 seyirci. | Kısılabilecekler: TikTok/IG/X (B1); işletme durumlarında revizyon geçmişi (admin engelleme kalır); lig modunda 25 tur. | **Karar: revizyon geçmişi yok, WCAG AA + 250 seyirci kalır, sade raporlar, sistem videoları R2** → Bölüm 8 |
| E2 | Dil kapsamı belirtilmemiş. | MVP yalnız Türkçe; metinler sonradan çeviriye uygun yapıda tutulur. | **Karar: yalnız Türkçe** → Bölüm 8 |

### F. Küçük netleştirmeler (itiraz edilmediği için kabul edildi)

- F1: Final oy gözden geçirmesinde "herkes bitirirse erken kapanabilir" ifadesi belirsiz → herkes bitirirse **kapanır**.
- F2: Duraklatma sırasında oy kabul edilmez; devam edilince o anki sunum slotu baştan başlar.
- F3: Puanlar 2 ondalıkla gösterilir; hesaplama tam hassasiyetle yapılır.
- F4: Az oy almış gönderinin ortalaması yanıltıcı olabilir (geç katılan seyirciler). MVP'de basit ortalama kalır, izlenir.
- F5: Oturum durum makinesi (lobi → oyun → duraklatıldı → bitti/iptal) teknik tasarımda kesinleşir.
- F6: Görsel dil (shadcn/ui Luma, "Sıcak Zine" paleti) ekran tartışmasında yeniden ele alınır.

## 8. Kesinleşen Oyun Kuralları

### 8.1 Puanlama yetkisi ve çıkar çatışması (A1)
- **Düello bağlamı** (eleme eşleşmesi, hibrit yarı final, hibrit final): Düellodaki iki rakip birbirinin gönderisini puanlayamaz. O turdaki diğer gönderileri puanlayabilir.
- **Lig bağlamı** (lig modu ve hibritin lig aşaması, 3+ oyuncu): Oyuncular kendi gönderisi dışındaki tüm gönderileri puanlar. Stratejik oy riski kabul edilir.
- **2 oyunculu lig** düello bağlamı sayılır (iki oyuncu birbirinin tek rakibidir).
- **Seyircisiz oyun desteklenir.** Tarafsız puanlayıcının olmadığı tek senaryo 2 oyuncu + 0 seyircidir.
- **İstisna:** Bir düelloyu puanlayabilecek tarafsız katılımcı odada yoksa, düellodaki iki rakip birbirini puanlar. Kontrol her turun gösterimi başlarken yapılır (geç katılım kuralı A2 geçerli).
- Hiçbir oyuncu hiçbir koşulda kendi gönderisini puanlayamaz.
- Seyirciler, bay geçen oyuncular ve elenip seyirciye dönen oyuncular her zaman tarafsız puanlayıcıdır.
- Geçerli puan almayan gönderi 0 sayılır. Bir düelloda iki gönderi de 0 olursa sonuç beraberliktir ve 8.5'e gider.
- _Revizyon (owner, C2 tartışması):_ İlk A1 kararındaki "2 oyunculu oyun en az 1 seyirciyle başlar" şartı kaldırıldı ve yerine yukarıdaki istisna getirildi.

### 8.2 Jüri ödülleri (A1)
- Oyun sonu ekranında esprili iki ödül gösterilir: **"En sert jüri"** (verdiği puanların ortalaması en düşük) ve **"En cömert jüri"** (en yüksek).
- Oyuncu ve seyirci fark etmeksizin puan veren tüm katılımcılar dahildir.
- _Varsayılan ayrıntılar (itiraz edilmezse geçerli):_ Ödüle girmek için oyun boyunca en az 5 puan vermiş olmak gerekir. Eşitlikte ödül paylaşılır. Ödül yalnızca takma adı ve ortalamayı gösterir; kime kaç puan verildiğini göstermez.
- Şartı sağlayan en az 2 katılımcı yoksa ödüller gösterilmez; aynı kişi iki ödülü birden alamaz.

### 8.3 Seyirci hilesine karşı önlemler (A2)
Amaç hileyi imkânsız kılmak değil, zahmetli ve görünür kılmaktır. Bir oyuncunun arkadaşlarının seyirci olarak gelip ona oy vermesi hile sayılmaz.
- **Tarayıcı başına tek katılımcı kimliği.** Aynı tarayıcıdan ikinci katılım yapılamaz. Gizli sekme veya farklı tarayıcı riski kabul edilir.
- **Görünürlük.** Seyirci sayısı ortak ekranda görünür. Yönetici konsolunda seyirci listesi ve katılım saatleri bulunur.
- **Seyirciyi çıkarma.** Yönetici seyirciyi atabilir. Atılan seyircinin o turda kilitlenmemiş oyları silinir; kilitlenmiş turlar değişmez.
- **Seyirci girişini kapatma.** Yönetici "yeni seyirci kabul et" seçeneğini açıp kapatabilir. Varsayılan: açık.
- **Geç katılım kuralı.** O turun meme gösterimi başladıktan sonra katılan seyirci o turu izler ama puanlayamaz (final gözden geçirme dahil); bir sonraki turdan itibaren oy verir. Seçim aşamasında katılan o turda oy verebilir.
- **Seyirci onay modu (opsiyonel).** Yönetici ayarıdır, varsayılan kapalı. Açıkken her seyirci isteği yönetici onayından geçer.
- IP sınırlama, cihaz parmak izi ve şüpheli oy kalıbı tespiti yapılmaz.

### 8.4 Oyun süresi ve zamanlama (A3)
- **İlke:** Oyun uzun sürmeyecek şekilde tasarlanır, ancak kod kullanıcıyı süre üzerinden **sınırlamaz**. Hedef/maksimum süre kuralı yoktur.
- **Gösterim süresi medya tipine göre (sabit, yönetici ayarı değil):**
  - Resim / GIF: 12 sn izle-puanla + 3 sn son karar = 15 sn
  - Video: izleme süresi = klip süresi, ancak en az 12 sn (12 sn'den kısa klip son karesinde durur) + 5 sn son karar = 17–30 sn
- **Seçim süresi:** Varsayılan 60 sn. Yönetici 30–240 sn arasında değiştirebilir. Süren seçim aşamasına +15 / +30 / +60 sn eklenebilir; süren sayaç kısaltılamaz.
- **Final oy gözden geçirme süresi:** Varsayılan 45 sn, 15–120 sn arası ayarlanabilir. Yönetici erken kapatabilir.
- Tüm süre ayarı değişiklikleri bir sonraki turdan itibaren geçerlidir.
- **Sonuç ekranı:** 15 sn geri sayımla kendiliğinden geçer. Yönetici bekletebilir veya hemen geçebilir.
- **Tahmini süre:** Oyun oluşturma/ayar ekranında mod, oyuncu sayısı ve tur sayısına göre tahmini süre aralığı gösterilir ve canlı güncellenir.
- **Lig tur sayısı:** 1–50. Süreye dayalı sınır yok; 50 yalnız hatalı girişe karşı güvenlik sınırıdır. Tahmini süre gösterilir, karar yöneticiye aittir.
- **Hibrit yarı finaller paralel oynanır** (süre etkisi nedeniyle A3'te onaylandı; ayrıntılar C5'te).

### 8.5 Beraberlik (A4)
**Hangi beraberlikler çözülür:**

| Beraberlik | İşlem |
|---|---|
| Eleme eşleşmesi (tur atlayan) | Çözülür |
| Hibrit maç (yarı final, final) | Çözülür |
| Hibrit ilk 4 sınırı (4./5. eşitliği, çok kişili olabilir) | Çözülür |
| Lig modunda 1. sıra (şampiyon) | Çözülür |
| Hibrit ilk 4 içindeki sıralama (eşleşme tohumlaması) | Kura |
| Diğer tüm sıralar (2., 3., hibrit üçüncülüğü vb.) | Paylaşılır ("Ortak 2.") |

**Çözüm zinciri:**
1. **Hesapla ayırma** (yalnız hibrit maç): 3 turluk toplamlar eşitse lig aşaması toplamı yüksek olan kazanır.
2. **Uzatma turu** (en fazla 1 kez): Yeni durum, 30 sn seçim süresi, yalnız berabere kalanlar gönderir, diğer herkes puanlar. A1 kuralı geçerli: berabere kalanlar birbirini puanlayamaz. Çok kişili beraberlikte hepsi aynı turda yarışır ve tur sonucu onları sıralar; hâlâ berabere kalanlar 3. adıma geçer.
3. **Kura:** Uzatma turu da berabere biterse ekranda animasyonlu kura ile belirlenir. Yönetici karar vermez.
- Uzatma turunda puanlama kuralları 8.1 ile aynıdır (tarafsız puanlayıcı yoksa rakipler birbirini puanlar).
- Aynı turda birden fazla beraberlik varsa (ör. iki eleme eşleşmesi, iki yarı final) hepsi **tek bir uzatma turunda** birlikte çözülür.
- Uzatma puanları yalnız beraberliği çözer; lig toplamına, maç toplamına veya jüri ödüllerine eklenmez.

### 8.6 Dış medya kaynakları (B1)
- **MVP'de tek dış kaynak YouTube'dur** (resmi IFrame API: başlangıç/bitiş, oynat/durdur, sessiz kontrolü).
- TikTok, Instagram ve X MVP kapsamı dışındadır; sonraki sürümlerde değerlendirilir.
  - Gerekçe (2026-10-17 araştırması): Instagram embed verisi Meta uygulama incelemesi ve işletme doğrulaması gerektiriyor, oynatma kontrolü yok. X embed'lerinde oynatma kontrolü yok. TikTok'un mesajlaşma tabanlı kontrolü var ama ilk oynatmadan önce komutları yok sayıyor; güvenilirliği prototipsiz bilinmiyor.
- Oyuncu özel içerik olarak resim, GIF ve YouTube linki ekleyebilir. Video dosyası yüklenemez.
- YouTube klipleri en fazla 25 sn'dir; oyuncu başlangıç/bitiş noktasını seçer.
- Sistem kütüphanesinde admin tarafından yüklenen video meme'ler bulunabilir.

### 8.7 Ses ve otomatik oynatma (B2)
- **Ortak ekran varsa:** Ses yalnız ortak ekranda çalar. Telefonlarda video sessiz oynar; kullanıcı isterse kendi cihazında sesi açabilir.
- **Ortak ekran yoksa:** Telefonlarda video sessiz başlar, belirgin bir "Sesi aç" düğmesi gösterilir. Kullanıcının ses tercihi oturum boyunca hatırlanır (tarayıcı izin verdiği sürece).
- **Seçim önizlemesi:** Oyuncunun kendi önizlemesi normal davranır; kullanıcı kendisi başlatır, ses açıktır.
- **Ortak ekran açılışı:** Büyük bir "Ekranı başlat" düğmesi bulunur. Bu tıklama tarayıcının ses kilidini açar ve tam ekrana geçirir.
- Yöneticiye ayrı bir ses ayarı verilmez.
- Oyun sessiz de tamamen anlaşılır olmalıdır.

### 8.8 Kendi kendine akan oyun (B3)
- **İlke:** Oyun başladıktan sonra baştan sona kendi kendine akar; hiçbir an yönetici müdahalesini beklemez. Yönetici kolaylaştırıcıdır: duraklatma/devam, süre ekleme, durum değiştirme, içerik gizleme, katılımcı çıkarma, erken bitirme.
- **Yönetici bağlantısı koparsa:** Oyun durmaz, katılımcılara bir şey gösterilmez. Yönetici geri döndüğünde konsol güncel durumla açılır.
- **Medya gösterilemezse:** Oyun durmaz. Medya seçim sırasında doğrulanır. Sunumda yükleyemeyen cihaz bir kez daha dener, olmazsa "Bu cihazda yüklenemedi" gösterir. Görebilenler puanlar; göremeyenler final gözden geçirmede yeniden deneyebilir. Hiç puan gelmezse genel kural gereği o tur 0 puan alır. Yöneticiye ayrı bir "medya hatası çöz" akışı yoktur. Hatalar platform admin raporuna yazılır. Oyuncu açısından risk bilerek kabul edildi.
- **Sunucu yeniden başlarsa:** Bağlantılar geri gelince "Devam ediyoruz… 3-2-1" geri sayımı gösterilir; yönetici onayı beklenmez. Seçim, final gözden geçirme ve sonuç aşamaları kalan süreden devam eder. Gönderi gösterimi o gönderinin başından yeniden başlar.

### 8.9 Durum havuzu (C1)
- **Canlı çekim:** Her turun durumu o anda aktif olan havuzdan çekilir (aktif platform durumları + işletmenin aktif durumları). Oyun başında dondurma yoktur. Admin engeli devam eden oyunlarda da hemen etkili olur.
- Oturum geçmişi, durumun oynandığı andaki metnini saklar.
- **Tekrar kuralı:** Oturumda havuz bitene kadar hiçbir durum tekrar etmez. Havuz bitince en uzun süre önce kullanılanlar arasından rastgele seçilir. Oyun "durum kalmadı" diye asla takılmaz.
- Uzatma turları da havuzdan çeker.
- **Admin kısıtı yok:** "25'in altına arşivlenemez" kuralı kaldırıldı. Aktif platform durumu az olduğunda admin panelinde uyarı gösterilir.
- Havuzdaki her durumun seçilme olasılığı eşittir; platform/işletme ağırlıklandırması yoktur.

### 8.10 Durum değiştirme (C6)
- **Tur başına 1 değiştirme hakkı** vardır; uzatma turları dahil.
- **Önizleme:** Bir sonraki turun durumu, önceki turun sonuç ekranı süresince yönetici konsolunda görünür (ilk tur için lobide). Yönetici burada değiştirirse oyuncular fark etmez.
- **Acil değiştirme:** Hak önizlemede kullanılmadıysa seçim aşamasının ilk 15 sn'sinde kullanılabilir. Oyuncu seçimleri sıfırlanır, seçim süresi baştan başlar.
- Yeni durum da C1 kurallarıyla havuzdan rastgele çekilir; yönetici durumu kendisi seçmez.
- Değiştirilen durum o oturumda kullanılmış sayılır, tekrar çekilmez.

### 8.11 Lobi, ayarlar ve oyunu başlatma (C2)
- Mod, lig tur sayısı ve diğer ayarlar lobide serbestçe değiştirilebilir. Oyun başlayınca mod ve tur sayısı kilitlenir. Süre ayarları sonraki turlar için değiştirilebilir kalır.
- "Başlat" düğmesi kuralları denetler. Koşul sağlanmazsa pasif kalır ve nedenini yazar:
  - Tüm modlarda en az 2 oyuncu.
  - Hibrit modda en az 4 oyuncu.
  - **Seyirci şartı yok:** Oyun hiç seyirci olmadan, yalnız oyuncularla oynanabilir (owner kararı: ör. 4 kişilik arkadaş grubu hepsi oyuncu olarak oynayabilmeli; sosyal ortamda adaletsizliği insanlar kendileri yönetir).
- Oyun başlarken bekleyen oyuncu istekleri seyirciye dönüşür ve kişiye bildirim gösterilir.
- Oyun başladıktan sonra oyuncu kadrosu kilitlenir; yeni gelenler yalnız seyirci olarak katılabilir.
- Özel içerik ayarı oyun sırasında değiştirilebilir; bir sonraki turdan itibaren geçerlidir.
- **Oyuncu sayısında ürün sınırı yok** (owner kararı, 2026-10-18). Yalnız hatalı/kötü niyetli kullanıma karşı 1000 oyunculuk teknik güvenlik sınırı vardır. Kalabalık oyunun uzunluğu tahmini süre ile gösterilir; karar yöneticidedir.
- **Oyuncu kabulü (C12 ile güncellendi):** Varsayılan **otomatik kabul** — oyuncu olmak isteyen sırayla kabul edilir. İsteğe bağlı **"Oyuncu onayı"** ayarı açıksa her oyuncu isteği yönetici onayından geçer; reddedilen istek seyirci olur.

### 8.12 Oturum hakları ve yaşam döngüsü (C3)
- **Hak oyun başlatılınca düşer.** Lobi oluşturmak hak tüketmez. Başlatırken "1 oyun hakkın düşecek, kalan: N" onayı gösterilir.
- Hakkı 0 olan işletme lobi açamaz. Başlat anında hak yeniden kontrol edilir.
- İşletmenin aynı anda yalnız 1 aktif oturumu (lobi veya oyun) olabilir.
- Yönetici lobiyi istediği an iptal edebilir; hak düşmediği için kayıp yoktur.
- Başlatılmamış lobi oluşturulmasından 24 saat sonra kendiliğinden kapanır.
- Başlamış oyunda 10 dakika boyunca bağlı hiçbir oyuncu veya seyirci yoksa (yönetici konsolu ve ortak ekran sayılmaz) oyun otomatik sonlanır.
- Herhangi bir modda aktif oyuncu sayısı 2'nin altına düşerse oyun hemen biter; kalan oyuncu varsa şampiyon olur.
- Erken bitirilen veya otomatik sonlanan oyunda hak iade edilmez. Platform admin elle hak ekleyebilir.

### 8.13 Rövanş (C3 ek)
- Oyun bitince yönetici tek tuşla aynı odada yeni bir lobi açabilir.
- Katılımcılar odadan çıkmadan yeni lobiye geçer; oyuncu olmak isteyenler yeniden istek gönderir.
- Yeni oyun başlatıldığında 1 hak düşer (normal kural).

### 8.14 Eleme modu: bay ve sıralama (C4)
- Tek sayıda aktif oyuncu varsa bir oyuncu bay geçer ve doğrudan sonraki tura çıkar.
- **Bay geçen oyuncu o tur meme göndermez,** o turu tarafsız puanlayıcı olarak puanlar.
- Bay, o ana kadar en az bay geçmiş oyuncular arasından rastgele seçilir; herkes bir kez geçmeden kimse ikinci kez geçmez.
- Tur başında ekranda "X bay geçti" gösterilir.
- **Sıralama:** Final galibi 1., final kaybedeni 2. Diğerlerinde daha geç turda elenen önde; aynı turda elenenler o turdaki gönderi puanına göre sıralanır; eşitlikte sıra paylaşılır (8.5).

### 8.15 Hibrit modun yapısı (C5)
- **Lig aşaması:** 5 tur, tüm oyuncular. 4 oyuncuda da 5 tur oynanır.
- İlk 4'e giremeyenler seyirciye dönüşür (elenme geçişi gösterilir) ve puanlamaya devam eder.
- **Yarı finaller paralel:** 1.–4. ve 2.–3. eşleşmeleri aynı turlarda oynanır. 4 oyuncu aynı duruma gönderir; 3 tur. Eşleşmedeki rakipler birbirini puanlayamaz, diğer eşleşmeyi puanlar (8.1).
- **Final:** 3 tur. Toplam hibrit: 5 + 3 + 3 = 11 tur.
- Maç sonucu 3 turun puan toplamıyla belirlenir; beraberlik 8.5.
- İlk 4 içindeki sıra eşitliği kura ile çözülür.
- **Sıralama:** Final galibi 1., kaybeden 2. Yarı final kaybedenlerinden lig puanı yüksek olan 3., diğeri 4. (eşitlikte paylaşılır). 5. ve sonrası lig aşaması sırasına göre.

### 8.16 Katılımcı yönetimi (C7, C8)
**Yönetici eylemleri:**

| Eylem | Kime | Sonuç |
|---|---|---|
| Seyirciye al | Oyuncu | Odada kalır, puanlamaya devam eder, artık yarışmaz. |
| Odadan at | Oyuncu / seyirci | Odadan çıkarılır; aynı tarayıcıyla geri giremez. O turdaki kilitlenmemiş oyları silinir. |
| Takma adı sıfırla | Oyuncu / seyirci | Geçici ada ("Katılımcı 7") döner, yeni ad seçmesi istenir. Rol ve puanlar korunur. |

**Oyuncu ayrılınca (seyirciye alma, atma veya kendi isteği):**
- Geçmiş turlar ve verdiği oylar değişmez.
- O turun kilitlenmemiş gönderisi geçersiz olur.
- Gelecek turlara ve sıralamaya dahil edilmez.
- Eleme/hibrit: Turun eşleşmeleri belirlenmeden ayrılırsa kalanlar yeniden eşleştirilir; belirlendikten sonra ayrılırsa rakip hükmen kazanır.
- Hibrit: İlk 4 belli olmadan aktif oyuncu 4'ün altına düşerse yarı finaller iptal edilir, lig tablosu final sonuç olur. İlk 4 belli olduktan sonra ayrılan yarı finalistin rakibi hükmen finale çıkar; finalist ayrılırsa diğeri hükmen şampiyon olur. Hiç uygun oyuncu kalmazsa oyun şampiyonsuz biter.
- **Kendi isteğiyle ayrılma:** Oyuncu menüden "Oyunu bırak, seyirci ol" seçebilir; sonuç "seyirciye al" ile aynıdır.
- **Bağlantısı kopan oyuncu** otomatik çıkarılmaz; gönderi yapmadığı turlardan 0 alır. Çıkarma kararı yöneticinindir.

**Takma ad kuralları:**
- 2–20 karakter; harf, rakam, boşluk, emoji. Link kabul edilmez.
- Oda içinde benzersiz (büyük/küçük harf duyarsız).
- Otomatik küfür filtresi yoktur; yöneticinin "takma adı sıfırla" aracı kullanılır.

### 8.17 Cihazlar ve yeniden bağlanma (C9)
- **Aynı cihaz:** Yenileme veya kısa kopmada kişi otomatik olarak aynı rol ve durumla geri döner (tarayıcıda saklanan katılımcı kimliği).
- **Yeni cihaz:** Kişi kendi takma adıyla girmeye çalışınca "Bu ad kullanımda. Sen misin? Yöneticiden devam onayı iste" seçeneği çıkar. Yönetici onaylarsa yeni cihaz kimliği (rol, puanlar, o turun seçimi) devralır; eski cihaz oturumdan düşer. Oyuncu ve seyirci için aynıdır.
- **Yönetici konsolu:** Aynı işletme hesabıyla birden fazla cihazda aynı anda açılabilir. Devralma ekranı yoktur. Komutlar sunucu tarafından denetlenir; eşzamanlı aynı komutlar ayrı ayrı uygulanabilir (ör. iki kez +30 sn = +60 sn), bu kabul edilmiştir.

### 8.18 Ortak ekran (C10)
- Telefonlar her durumda meme'i ve puanlama ekranını gösterir; ortak ekran ek bir yüzeydir.
- **Açma yolları:** (1) Konsoldan "Ortak ekranı aç" ile aynı cihazda yeni sekme. (2) Başka cihazda `/ekran` sayfasına gidip eşleştirme kodunu girme. Eşleştirme kodu yönetici konsolda "Ekran eşleştir"e basınca üretilir; **6 haneli rakam** (oda kodundan farklı biçim), tek kullanımlık, 5 dakika geçerli.
- **Aynı anda tek ortak ekran.** Yeni eşleşen ekran eskisini düşürür.
- Ekran bağlantısı gizli anahtarla korunur, yalnız izler, komut gönderemez.
- Ekran koparsa oyun devam eder.
- Oyun boyunca ekranın köşesinde küçük QR ve oda kodu gösterilir (sonradan gelen seyirciler için).

### 8.19 Hesap durumu değişiklikleri (C11)
- **Hesap pasife alınırsa:** Yöneticinin tüm girişleri kapanır, yeni oturum açılamaz, açık lobi kapanır. Süren oyun sonuna kadar devam eder.
- **Platform admin herhangi bir aktif oturumu tek tuşla sonlandırabilir** (kötüye kullanım, şikâyet vb.).
- **Admin şifre sıfırlarsa:** Yöneticinin tüm cihazlardaki girişleri kapanır; süren oyun etkilenmez.
- **İşletme kendi şifresini değiştirirse:** Değişikliği yaptığı cihaz açık kalır, diğer cihazlardaki girişler kapanır.

### 8.20 Yöneticinin rolü ve oynaması (C12)
- **Yöneticinin zorunlu işleri yalnız lobidedir:** oturumu açmak ve oyunu başlatmak (oyuncu onayı ayarı açıksa onaylar da). Oyun başladıktan sonra hiçbir modda zorunlu yönetici eylemi yoktur.
- Duruma bağlı onaylar: cihaz devri (8.17) ve açıksa seyirci onay modu (8.3).
- **Yönetici aynı zamanda oyuncu olabilir.** Odaya normal bir katılımcı olarak (QR/kod ile, başka cihaz veya ayrı sekme) girer; konsol ve katılımcı kimliği sistemde ayrıdır.
- Konsolda özel içeriği gönderenin adı yöneticiye gösterilir (gizlenmez). Oynayan yöneticinin bu bilgi, durum önizlemesi (8.10) ve rakip içeriğini gizleyebilme (8.21) avantajları MVP'de bilinerek kabul edilmiştir.

### 8.21 Özel içerik ve denetim (D1)
- **Özel içerik ayarı: Açık / Kapalı.** Varsayılan **Açık**. Ayar ekranında kısa açıklama gösterilir ("Oyuncular kendi resim, GIF ve YouTube içeriklerini ekleyebilir"). Riski almak istemeyen topluluk Kapalı'yı seçer.
- **Konsolda canlı liste (ayar Açıkken):** Seçim aşamasında gelen özel içerikler gönderen adıyla listelenir. Yönetici isterse bir içeriği reddeder; oyuncu "Bu içerik kabul edilmedi" bildirimi alır, süre varsa yeniden seçer, yoksa o tur 0 alır. Yönetici bakmazsa hiçbir şey beklemez.
- **"Hemen gizle":** Gösterim sırasında her içerik (sistem meme'leri dahil) tek tuşla tüm ekranlardan anında kaldırılabilir. Eylem platform admin raporuna yazılır.
  - Özel içerik gizlenirse: gönderi geçersiz, oyuncu o tur 0 alır.
  - Sistem meme'i gizlenirse: oyuncu cezalandırılmaz. Lig, hibrit lig aşaması ve hibrit maçlarda o tur için aynı aşamadaki diğer turlarının ortalamasını alır (aşamada başka turu yoksa 0). Eleme düellosunda rakibiyle uzatma turuna gider.
- **Otomatik uygunsuz içerik tespiti yoktur** (MVP sonrası).
- **Yükleme kuralları:** JPG, PNG, WebP, GIF; en fazla 10 MB. Yüklenen dosyalardan EXIF/konum gibi meta veriler otomatik silinir.
- Özel dosyalar ve YouTube link ayrıntıları oturum bitince silinir; raporlarda yalnız "özel içerik kullanıldı" ve tür bilgisi kalır.

### 8.22 KVKK ve veri saklama (D2)
- **Katılımcı bilgilendirmesi:** Katılım ekranında takma ad alanının altında kısa bir satır ve aydınlatma metni linki. Ayrı onay kutusu yok.
- **YouTube** gizlilik modlu `youtube-nocookie.com` üzerinden gösterilir. Kendi çerezlerimiz yalnız teknik olarak zorunlu olanlardır; çerez onay penceresi yok, gizlilik metninde bilgilendirme var.
- **Saklama:**
  - Özel dosyalar ve YouTube linkleri: oturum bitince silinir.
  - Takma adlar: önemli bir veri değildir. Oturum bitiminden **7 gün** sonra "Katılımcı 1, 2…" olarak anonimleştirilir; skorlar, oylar ve istatistikler kalır. _(Owner "daha önce de anonimleştirilebilir" dedi; 7 gün orchestrator varsayılanı — itiraz edilmezse geçerli.)_
  - Teknik loglar (IP vb.): 5651 sayılı kanun kapsamındaki yükümlülüğe göre; süre avukata teyit ettirilecek.
  - İşletme hesabı verileri: hesap aktif olduğu sürece.
- **İşletme kullanım koşulları:** Özel içerik ayarını açan işletme kendi oturumlarındaki içerikten ve yazdığı durumlardan sorumludur.
- Canlıya çıkmadan önce aydınlatma metni, gizlilik metni ve kullanım koşulları hukuki incelemeden geçirilecek.

### 8.23 Sistem meme kütüphanesi depolaması (E1 / owner sorusu)
- Sistem kütüphanesi (resim, GIF, video) **kendi depolamamızda dosya olarak** tutulur; hedef sağlayıcı **Cloudflare (R2)**. Platform bağımlılığı yoktur.
- Google Drive oynatma kaynağı olarak kullanılmaz (oynatıcı kontrolü yok, açıklanmayan görüntüleme kotaları).
- Admin'in sistem kütüphanesine YouTube linki eklemesi kaldırılır; oyuncu özel içeriğinde YouTube linki kalır.
- Videolar içe aktarma/yükleme sırasında tüm cihazlarda oynayan tek biçime dönüştürülür, küçültülür, kapak görseli çıkarılır. 25 sn'den uzunlar admin tarafından başlangıç/bitiş seçilerek dosya üzerinde kesilir.
- **Kaynak arşiv:** Owner'ın elinde ağırlıklı X, nadiren Instagram/YouTube linklerinden oluşan bir meme arşivi var. Owner bunları indirip dosya arşivi oluşturacak (yt-dlp önerildi). Bizim taraf: klasörden toplu içe aktarma aracı.
- Her kütüphane öğesinin orijinal kaynak linki admin tarafında meta veri olarak saklanır (tekrar indirme ve mükerrer kontrolü için).
- Başlık, etiket ve kategoriler admin tarafından **elle** girilir. Yapay zekâ ile etiket önerisi yok.

### 8.24 Kapsam (E1)
- İşletme durumları: oluşturma, düzenleme, arşivleme, yeniden etkinleştirme. **Revizyon geçmişi tutulmaz.** Admin tüm işletme durumlarını görebilir, engelleyebilir/yeniden açabilir, metni düzenleyemez. Admin'in engellediği durum işletme tarafından düzenlense de admin açana kadar engelli kalır.
- Erişilebilirlik hedefi **WCAG 2.1 AA** kalır.
- Kapasite doğrulama hedefi oturum başına **toplam 300 eşzamanlı katılımcı** (oyuncu + seyirci, herhangi bir dağılım) + yönetici cihazları + 1 ortak ekran. _(Oyuncu sınırı kalkınca eski 16+250 hedefi buna çevrildi.)_
- **Platform admin raporları sade:** oturum listesi ve filtreler; oturum detayı (ayarlar, katılımcılar, turlar, durumlar, sonuçlar, gizlenen içerikler, hatalar, çıkarmalar); işletme bazında kullanım. Grafikli analiz panelleri yok.

### 8.25 Dil (E2)
- Hedef pazar Türkiye. **Yalnız Türkçe**; çok dil desteği MVP kapsamında değil.

### 8.26 Küçük netleştirmeler (F)
- Final oy gözden geçirmede tüm **bağlı** uygun katılımcılar "Bitirdim" derse aşama kapanır.
- Duraklatma sırasında tüm katılımcı eylemleri (seçim, oy) dondurulur. Devam edilince o anki gönderi gösterimi baştan başlar; seçim ve diğer aşamalar kalan süreden devam eder.
- Duraklatmanın süre sınırı yoktur (yöneticinin bilinçli kararı). Sonuç ekranında "beklet" de bir duraklatmadır.
- Puanlar 2 ondalıkla gösterilir; hesaplama tam hassasiyetle yapılır.
- Puan, geçerli oyların aritmetik ortalamasıdır; az oy alan gönderiye düzeltme uygulanmaz.
- Oturum durum makinesi teknik tasarımda kesinleşir.
- Görsel dil (bileşen kütüphanesi, palet, ton) ekran tartışmasında yeniden ele alınır.

### 8.27 Platform admin hesabı
- **Tek bir admin hesabı** vardır; sunucu tarafında bir komutla oluşturulur. Panelden admin hesabı oluşturulamaz.
- Owner ve proje ortağı bu hesabı **ortak** kullanır; kişi başına ayrı hesap yoktur ve gerekmez.
- Giriş kullanıcı adı + güçlü şifre ile yapılır. İki aşamalı doğrulama MVP sonrası.

### 8.28 Oda kodu
- 6 karakter; birbirine karışan karakterler (0/O, 1/I vb.) kullanılmaz.
- QR, oda kodunu içeren bir linktir; QR ile gelen kod girmez.
- Oturum bitince kod geçersiz olur; rövanşta aynı kod korunur.

### 8.29 Admin: platformun sahibi (owner ilkesi — ÖNEMLİ)
- **İlke:** Platform admin oyunun ve platformun her şeyinin sahibidir. İstediği müşteriye istediği imtiyazı verebilir. Kriz anında sorunu admin panelinden tek hamlede çözebilmelidir.
- İşletmelere karşı **bonkör** davranılır.
- **Deneme oturumu yoktur.** Yeni işletme denemek isterse admin ek hak verir. Hak ekleme/çıkarma admin panelinden %100 ayarlanabilir.
- **İşletme bazında imtiyazlar** (boş bırakılırsa platform varsayılanı geçerli):
  - Oyun hakkı: istenen kadar ekleme/çıkarma veya **sınırsız hak**.
  - Aynı anda aktif oturum sayısı (varsayılan 1).
  - Başlatılmamış lobi ömrü (varsayılan 24 saat).
- **Kriz araçları:** oturum detayında "hakkı iade et"; aktif oturumu sonlandırma; **işletme adına giriş** (admin işletmenin konsolunu açıp müdahale eder; her giriş kayda geçer).
- Platform genelindeki sabitler (gösterim süreleri, dosya boyutu, varsayılanlar) admin paneline taşınmaz; sunucu ayarıdır.

---

## 9. MVP Sonrasına Ertelenenler
- TikTok, Instagram ve X içerik desteği (B1).
- Oynayan yönetici için konsolda gönderen adının ve durum önizlemesinin gizlenmesi (C12).
- Özel içerik için ara seviyeler (ör. yönetici ön onaylı "Onaylı" modu) (D1).
- Otomatik uygunsuz görsel tespiti (D1).
- Yapay zekâ ile kütüphane etiket önerisi (8.23).
- Çok dil desteği (E2).
- Admin girişinde iki aşamalı doğrulama (8.27).

## 10. Owner'ın Ayrıca Ele Alacağı Konular
- **Hukuki konular (telif, platform kuralları, KVKK metinleri, 5651 log süreleri):** Owner aksini söyleyene kadar ürün ve teknik kararlarda hukuki risk **dikkate alınmaz**; kararlar hukuki sorun yokmuş gibi verilir. Owner bu konuları daha sonra bir hukukçuyla ayrıca ele alacak.

---

## Açık Sorular

_Owner tercihi: ileriki aşamalara ait sorular gerektiği zaman sorulur, önceden sorulmaz._

2. (Teknoloji aşamasında) Platform genelinde eşzamanlı oturum hedefi ve QR linkleri için alan adı.
3. (M5 başında) Medya hattı ortamı: Cloudflare Containers (Workers Paid, 5 $/ay) mı, başka yol mu?
4. (Yayın öncesi, owner içerik işi) İlk platform durumları seti (~100+) ve meme kütüphanesi/kategoriler.

---

## Akış Kaydı

### 2026-10-17 — Oturum 1
- Owner çalışma modelini tanımladı: Claude Code orchestrator, Codex ve OpenCode worker (bazen Codex orchestrator / OpenCode worker).
- Kararların bu dosyada ilk andan itibaren tutulmasına karar verildi.
- AGENTS.md ve CLAUDE.md yazımı tartışmalar sonrasına ertelendi; kısa ve özgürlük tanıyan biçimde yazılacak.
- Orchestrator, repoda silinmiş ama git geçmişinde duran eski MVP spec'ini fark etti; owner'a soruldu.
- Owner yanıtı: Eski dokümanlar `docs/old/` altına geri alındı. Ürün aynı, ancak eski kararlar referans alınmayacak; tüm kararlar sıfırdan burada verilecek. Tartışmalar bitince `docs/old/` silinecek.
- Worker modelleri iş dağıtımı başladığında bildirilecek.
- Sıradaki adım: Owner ürünü kendi anlatımıyla tarif edecek.
- Owner netleştirdi: `docs/old/` ürünü doğru anlatıyor. Kararlar eleştirel olarak yeniden değerlendirilecek, boşluklar kapatılacak ve uygulamaya geçilebilir hale getirilecek.
- Orchestrator iki eski dokümanı okudu ve incelemesini Bölüm 7'ye yazdı (A1–A4, B1–B3, C1–C12, D1–D2, E1–E2, F1–F6). Owner kararı bekleniyor.
- A1 karara bağlandı: Seçenek 1 (çıkar çatışması kuralı) + jüri ödülleri. Bölüm 8'e yazıldı.
- A2 karara bağlandı: a+b+c+d+e kesin, f (seyirci onay modu) opsiyonel ayar, varsayılan kapalı. Bölüm 8.3'e yazıldı.
- A3 karara bağlandı: süreyi kısaltan öneriler onaylandı (medya tipine göre 15/30 sn gösterim, 60 sn varsayılan seçim, 15 sn otomatik sonuç ekranı, tahmini süre, paralel yarı finaller). Owner kodda süre sınırı istemiyor; lig tur sayısında sınır yok, karar yöneticide.
- A4 karara bağlandı: çözülecek beraberlikler tablosu, zincir (hesap → 1 uzatma turu → kura). Lig tur sayısı 1–50 (50 güvenlik sınırı).
- A grubu tamamlandı; B grubuna geçildi.
- B1 karara bağlandı: TikTok/Instagram/X embed kısıtları araştırıldı; owner MVP'de yalnız YouTube'u seçti.
- B2 karara bağlandı: ses ortak ekranda, telefonlarda sessiz + kullanıcı açabilir; 'Ekranı başlat' ile ses kilidi açılır.
- B3 karara bağlandı: oyun kendi kendine akar; yönetici kopması ve medya hatası oyunu durdurmaz; sunucu yeniden başlarsa geri sayımla otomatik devam. B grubu tamamlandı.
- C1 ve C6 karara bağlandı: canlı havuz çekimi + havuz bitince tekrar kullanım; önizleme/acil değiştirme, tur başına 1 hak.
- C2 ve C3 karara bağlandı; rövanş düğmesi MVP'ye eklendi. Owner, 2 oyunculu oyunda seyirci şartını reddetti: oyun seyircisiz de oynanabilmeli, oyuncuların kendine oy verememesi yeterli. Bunun A1'deki düello kuralına etkisi owner'a soruldu.
- A1 revize edildi: düello kuralı kalıyor; tarafsız puanlayıcı yoksa (2 oyuncu, 0 seyirci) rakipler birbirini puanlar. A4 zinciri buna göre güncellendi.
- C4 ve C5 karara bağlandı (bay kuralları, genel eleme sıralaması, hibrit yapısı 5+3+3=11 tur, 4 oyuncuda da 5 lig turu).
- C7 ve C8 karara bağlandı: seyirciye al / odadan at / takma adı sıfırla eylemleri, ayrılma kuralları, 'Oyunu bırak' seçeneği, takma ad kuralları, küfür filtresi yok.
- C9 ve C10 karara bağlandı: yönetici onaylı cihaz devri, çoklu cihazda yönetici konsolu, ortak ekran eşleştirme kodu, tek ortak ekran, köşede QR.
- C11 karara bağlandı: pasif hesapta süren oyun biter, admin her oturumu sonlandırabilir, şifre sıfırlama girişleri düşürür.
- C12 tartışması: owner, modların yöneticiye gerçekten ihtiyaç duyup duymadığının kontrolünü istedi. Analiz: oyun sırasında hiçbir modda zorunlu yönetici eylemi kalmadı; zorunlu olanlar yalnız lobide (oturum açma, oyuncu onayı, başlatma).
- C12 karara bağlandı: yönetici oynayabilir, gönderen adı konsolda görünür (gizleme MVP sonrası). Oyuncu kabulü varsayılan otomatik, isteğe bağlı oyuncu onayı ayarı. Bölüm 9 (MVP sonrasına ertelenenler) açıldı. C grubu tamamlandı.
- D1 kısmi karar: özel içerik ayarı yalnız Açık/Kapalı kalır; 'Onaylı' ara seviyesi MVP sonrasına. Owner diğer D1 sorularının bu karara göre yeniden sorulmasını istedi.
- D1 karara bağlandı: varsayılan Açık, konsolda canlı liste + reddetme, her içerik için 'Hemen gizle', otomatik tespit yok, yükleme kuralları onaylandı.
- Orchestrator kendi önerisindeki hatayı düzeltti: sistem meme'i gizlenince ligde 'toplama eklenmez' = 0 demekti. Düzeltme önerisi: aynı aşamadaki diğer turlarının ortalaması; eleme düellosunda uzatma. Owner onayı bekleniyor.
- D2 karara bağlandı: kısa bilgilendirme (onay kutusu yok), youtube-nocookie, takma adlar 7 gün sonra anonimleşir (owner takma adları önemsemiyor), işletme sorumluluğu kullanım koşullarında. D grubu tamamlandı (D1 düzeltmesi hâlâ owner onayında).
- Owner sorusu: sistem meme videoları için YouTube yerine Google Drive kullanılabilir mi (elde Drive'da çok sayıda meme videosu var)? Orchestrator değerlendirdi: Drive oynatma için uygun değil (oynatıcı kontrolü yok, resmi olmayan görüntüleme kotaları, 250 cihazın aynı anda aynı dosyayı istemesi kotayı tetikleyen tam senaryo). Öneri: Drive arşivi bir kez içe aktarılıp kendi nesne depolamamıza (ör. Cloudflare R2; çıkış trafiği ücretsiz, 10 GB'a kadar ücretsiz) alınsın. Owner kararı bekleniyor.
- Owner netleştirdi: Drive arşivi yok; elde link arşivi var (çoğu X). Owner linkleri indirip kendi video arşivini oluşturmak istiyor; Cloudflare depolama onaylandı. Orchestrator telif/platform kuralları riskini (sistem kütüphanesinde içerik sağlayıcı sorumluluğu) bildirdi ve önlemler önerdi. Bekleyenler: risk kararı, yapay zekâ etiketleme, D1 düzeltmesi, E1 kalanı, E2.
- Owner kararı: hukuki risk aksi söylenene kadar kararlarda dikkate alınmayacak; owner bunu bir hukukçuyla ayrıca ele alacak (Bölüm 10).
- D1 düzeltmesi, E1 ve E2 karara bağlandı; yapay zekâ etiketleme reddedildi (elle etiketleme). F maddeleri itiraz edilmediği için kabul edildi. **Eski tasarımın eleştirel incelemesi (Bölüm 7) tamamlandı.**
- Admin hesabı (tek ortak hesap, sunucu komutuyla) ve oda kodu kuralları karara bağlandı.
- Owner, spesifikasyondan önce tüm kararların toplu self-review'ını istedi: tutarsızlık/eksik kontrolü; sorulmadan düzeltilebilecekler düzeltilecek, diğerleri sorulacak.
- Self-review yapıldı; orchestrator sorulmadan düzeltilebilecek 14 tutarsızlık/boşluğu Bölüm 8'de düzeltti (2 oyunculu lig = düello, 0 puan kuralı, jüri ödülü alt sınırı, kısa video süresi, süre ayarları, toplu uzatma, uzatma puanlarının toplama girmemesi, değiştirilen durumun kullanılmış sayılması, kadro kilidi, özel içerik ayarının oyun içi değişimi, 10 dk kuralının kapsamı, <2 oyuncuda bitiş, ekran eşleştirme kodu güvenliği, duraklatma davranışı). Owner'a sorulacaklar ayrıca iletildi.
- Deneme oturumu: seçenek (a), ayrı deneme modu yok. Owner ilkesi kaydedildi: admin platformun her şeyinin sahibidir, istediği müşteriye istediği imtiyazı verebilir, krizleri panelden tek hamlede çözer (8.29). İleriki aşama soruları gerektiğinde sorulacak.
- Admin imtiyaz listesi ve kriz araçları onaylandı. Owner oyuncu üst sınırını kaldırdı (teknik güvenlik sınırı 1000); kapasite hedefi toplam 300 katılımcıya çevrildi. Birleşik spesifikasyon yazımına geçildi.
- Birleşik ürün spesifikasyonu yazıldı: `docs/PRODUCT_SPEC.md` (v2 taslak). Owner incelemesi ve onayı bekleniyor; onaydan sonra `docs/old/` silinecek.
- Owner spesifikasyonu onayladı, şu eklemelerle: (1) admin işletme hesabını kolayca tanımlar (tek kısa form, kopyalanabilir giriş özeti), işletme kendi kimliğiyle girip QR/link paylaşabilir; (2) 'ani ölüm turu' adı **'uzatma turu'** olarak değiştirildi; (3) esprili ton ekran aşamasında ele alınacak. `docs/old/` silindi.
- Spesifikasyon, kayıt dosyası ve eski dokümanların silinmesi commit'lendi (`9f38ed8`).
- **Ekranlar ve kullanıcı akışları aşaması başladı.** Sıra: katılımcı (telefon) → ortak ekran → yönetici konsolu → işletme/admin panelleri → görsel dil. Yöntem: önce yazılı akış ve ekran listesi, kritik ekranlar için tıklanabilir taslaklar (owner'a özel artifact).
- Katılımcı akışı iskeleti onaylandı; eşleşmelerin görünmesi, seyircinin seçim aşaması görünümü ve 1–5 düğmeli puanlama kararlaştırıldı (Bölüm 3.1).
- Katılımcı akışının kritik ekranları için renksiz taslaklar hazırlandı (owner'a özel artifact: https://claude.ai/artifact/7zjTFmcWmbc8BGuk6kKgHg): 1 Seçim, 2 Gösterim ve puanlama, 3 Final gözden geçirme, 4 Tur sonucu (eleme), 5 Seyirci seçim aşaması. Görsel dil bilinçli olarak nötr; owner geri bildirimi bekleniyor.
- Owner 5 kritik katılımcı ekranının yerleşimini onayladı (görsel dil ve esprili ton hariç; onlar sonraki aşamada). Sırada katılım, lobi ve oyun sonu ekranları.
- Taslaklara 6 Katılım, 7 Lobi, 8 Oyun sonu eklendi. Kalan katılımcı ekranları (geçişler, durum ekranları, menü) taslaksız; spesifikasyondaki kurallarla tanımlı.
- Katılımcı tarafı tamamlandı. Ortak ekran aşaması: canlı oy sayacı ve sırayla sonuç açıklama onaylandı (Bölüm 3.2).
- Ortak ekran taslakları hazırlandı (yeni artifact, hesap değişikliği nedeniyle ayrı: https://claude.ai/artifact/96VjQYiwV7E3dAwSLBNDpM): 1 Lobi, 2 Gösterim, 3 Sonuç (sırayla açıklama). Katılımcı taslakları önceki hesaptaki artifact'te: https://claude.ai/artifact/7zjTFmcWmbc8BGuk6kKgHg
- Yönetici konsolu yapısı ve 'Hemen gizle' için 1 sn basılı tutma onaylandı (Bölüm 3.3).
- Yönetici konsolu taslakları hazırlandı (https://claude.ai/artifact/FEZXgL4eRjkhgJmHm33n5y): 1 Lobi, 2 Seçim aşaması, 3 Gösterim (Hemen gizle, basılı tutma çalışır halde).
- İşletme/admin panel yapısı, MVP'de 'Linkten ekle', kategori + açıklama meta verisi, link listesiyle toplu içe aktarma ve etiketlenmemiş kuyruğu onaylandı (Bölüm 3.4).
- Panel taslakları hazırlandı (https://claude.ai/artifact/Ln6UJBa8BSHAByoDfzDUAQ): 1 Admin · Linkten ekle (menü yapısıyla, işleme akışı çalışır), 2 İşletme · Ana sayfa.
- Panel taslakları onaylandı. Ekran aşamasının son adımı başladı: görsel dil (2–3 yön, aynı ekranlar üzerinde karşılaştırma).
- Görsel dil için 3 yön hazırlandı (https://claude.ai/artifact/4Xg6tWgdaxgtQUKtKe4tUF), her biri telefon puanlama + ortak ekran gösterim: A Sıcak Zine (açık krem, domates kırmızısı, chartreuse; Bricolage Grotesque + DM Sans), B Gece Şovu (koyu sahne, sarı vurgu; Anton + Manrope), C Çıkartma Pop (beyaz, kalın kontur, sert gölge, sarı/pembe/mavi; Archivo). Owner seçimi bekleniyor.
- Görsel dil: owner 'B · Gece Şovu' yönünü seçti (Bölüm 3.5). **Ekranlar ve kullanıcı akışları aşaması tamamlandı.**
- Teknoloji aşaması başladı. Ölçek 1–2 eşzamanlı oyun; barındırma için Cloudflare (Pages + Durable Objects + D1 + R2) ve medya işleri için GitHub Actions onaylandı (Bölüm 4.1).
- Teknik yapı onaylandı (Bölüm 4.2); Unity gerekmediği owner'a açıklandı. **Teknoloji aşaması tamamlandı.** Uygulama planı ve iş dağılımı aşamasına geçildi.
- Uygulama planı (`docs/IMPLEMENTATION_PLAN.md`), `AGENTS.md` ve `CLAUDE.md` taslakları yazıldı; owner incelemesi bekleniyor.
- Cloudflare: owner'ın mevcut hesabı kullanılacak; `mol-` önek kuralı AGENTS.md'ye eklendi.
- Worker modelleri belirlendi (Bölüm 1). Repo gizliye alındı ve commit'ler GitHub'a gönderildi.
- **M0 başladı (2026-10-18):** Kurulum işi OpenCode'a (glm-5.3-flash#max) verildi; dal `m0-scaffold`, worktree `../mol-wt-m0`. Uzak Cloudflare işlemleri yasak; owner'ın `wrangler login` yapması bekleniyor.
- M1 hazırlığı: motor API sözleşmesi taslağı yazıldı (`docs/contracts/engine-api.md` v0.1).
- **M0 tamamlandı:** OpenCode iskeleti kurdu (pnpm 12, TS 5.9, Vitest 4, Wrangler 4, React 19, Vite 8, Tailwind 4); orchestrator typecheck/lint/test/build doğruladı ve main'e birleştirdi. Not: `@cloudflare/vitest-pool-workers` yerine `@cloudflare/vitest-plugin` kullanılıyor. Cloudflare kaynakları henüz oluşturulmadı (`wrangler login` bekleniyor).
- GitHub Actions CI ilk çalıştırmada 'startup_failure' verdi (iş başlamadan; workflow YAML geçerli). Muhtemel neden hesap/faturalama ayarı; owner'dan run sayfasındaki mesaj istendi.
- **M1 başladı:** Motor işi Codex'e (gpt-6.1-sol, medium) verildi; dal `m1-engine`, worktree `../mol-wt-m1`.
- Cloudflare: owner `wrangler login` yaptı. `mol-db` D1 veritabanı oluşturuldu (EEUR). R2 hesapta etkin değil; owner'ın dashboard'dan etkinleştirmesi gerekiyor. GitHub Actions hatasının nedeni: hesapta başarısız ödeme / harcama limiti; owner'a seçenekler sunuldu.
- R2 owner tarafından etkinleştirildi (kart bağlandı); `mol-media` bucket oluşturuldu.
- **Owner kararı: GitHub Actions kullanılmayacak** (hesapta faturalama sorunu; owner uğraşmak istemiyor). GitHub yalnız kod deposu. CI yerine yerel `pnpm verify`; yayın orchestrator tarafından yerelden `wrangler` ile. Medya hattı ortamı M5'te (aday: Cloudflare Containers, 5 $/ay). `.github/workflows/ci.yml` silindi.
- **M1 tamamlandı:** Codex motoru yazdı (136 test, 2.100 simüle oyun); Codex sandbox'ı git'e yazamadığı için commit'i orchestrator attı. `pnpm verify` geçti, main'e alındı. Kabul edilen SPEC-QUESTION varsayımları: boş durum havuzunda başlatılamaz/oyun sonlanır; hibrit lig aşamasında <4 oyuncuda mevcut oylar kilitlenir ve lig tablosu final olur; restore'da kesinti süresi düşülmez; tahmini süre duraklatma/ek süreyi saymaz; tüm jüri ortalamaları eşitse ödül yok. Takip işi: test süresi (~4 dk) kısaltılacak, puan eşitlik karşılaştırması kayan nokta hatasına karşı güvenli hale getirilecek.
- M2 hazırlığı: protokol (`docs/contracts/protocol.md`) ve veritabanı şeması (`docs/contracts/db-schema.md`) sözleşme taslakları yazıldı. M1 takip işi Codex'e (low) verildi.
- **2026-10-19:** Oturum kapanınca (bilgisayar/oturum yeniden başladı) M1 takip işi Codex'te yarıda kesildi, hiçbir değişiklik kalmamıştı; /tmp temizlendiği için görev dosyaları da kayboldu. Önlem: görev tanımları artık `docs/tasks/` içinde repoda, worker logları `.orchestrator/logs/` (gitignore) altında. M1 takip işi yeniden başlatıldı.
- M1 takip işi tamamlandı: varsayılan motor testleri 60 oyun/~15 sn, `pnpm test:heavy` 2.100 oyun/~4 dk; skor karşılaştırmaları tek yardımcıda (`compareScores`, 1e-12 göreli tolerans). Codex sandbox'ı git'e yazamıyor; commit'leri orchestrator atıyor.
- **Paralel çalışma başladı:** M2a (sunucu temeli: protokol, D1 şeması, kimlik, lobi, katılım) Codex'e (medium), M3a (Gece Şovu teması + katılımcı ekranları, sahte verilerle) OpenCode'a verildi. M2 iki parçaya bölündü: M2a temel, M2b oda Durable Object'i + WebSocket.
- **M2a tamamlandı:** Codex protokol şemaları, 13 tabloluk D1/Drizzle şeması (yerel migration), PBKDF2 kimlik, admin/işletme uçları, lobi ve HMAC katılımcı token'ları yazdı. Lobi süresi dolumu için cron her 10 dk (orchestrator 1 dk'dan değiştirdi). `pnpm verify` geçti, main'e alındı.
- **M2b başladı:** oda Durable Object'i + WebSocket Codex'e (medium) verildi (`docs/tasks/m2b-room-do.md`).
- Protokol v0.2: kabuk işlemleri (cihaz devri onayı/reddi, ekran eşleştirme kodu, rövanş) yönetici WebSocket'i üzerinden `shell` mesajı; yönetici görünümüne `ManagerShellInfo`; `recovery` mesajı. Codex'in sorusu üzerine orchestrator onayladı.
- **M2b tamamlandı:** oda Durable Object'i (WebSocket, alarm, kalıcılık, kurtarma, idempotentlik, hak düşürme, rapor, cihaz devri, ekran eşleştirme, rövanş, canlı durum havuzu). 33 sunucu testi; `pnpm verify` geçti, main'e alındı. **M2 bitti.** Fiziksel medya silme M6'ya kanca olarak bırakıldı.
- **M3a tamamlandı:** OpenCode Gece Şovu temasını (Tailwind 4 token'ları, Anton + Manrope self-hosted) ve 9 katılımcı ekranını sahte verilerle yazdı; `/dev/onizleme` sayfası; 22 web testi. Birleştirmede iç paketlerin eski `dist` tiplerinden okunması sorunu çıktı; orchestrator `@mol/engine` ve `@mol/shared` paketlerini kaynak koddan çözülecek şekilde düzeltti (temiz klonda verify geçti). M3b için açık noktalar: View'e gösterim toplamı ve ownSubmissionId eklenmeli; kütüphane görselleri R2 URL'leriyle gelecek; önizleme reducer'ları WS komutlarına dönecek.
- Orchestrator görsel kontrolü (M3a): durum metni/başlık hiyerarşisi ters, 'Eldin' yazım hatası → M3b'ye eklendi. **M3b** (ekranları sunucuya bağlama + ortak ekran + Playwright) OpenCode'a; **M7a** (300 katılımcılı yük testi aracı) paralel olarak Codex'e (low) verildi.
- 2026-10-19 — M3b OpenCode oturumu e2e aşamasında hareketsizlikten kesildi (asla çözülmeyen bir bekleme). Bağlantı katmanı ve ortak ekran commit'lenmişti. Kalan dev sunucuları kapatıldı, aynı oturum `-c` ile e2e'yi bitirmek üzere sürdürüldü.
- 2026-10-19 — M7a Codex işi ilk başlatmada stdin beklediği için hiç çalışmamıştı; `< /dev/null` ile yeniden başlatıldı.
- **M7a tamamlandı:** Codex `tools/loadtest` aracını yazdı (botlar, ACK gecikmesi, aşama senkron raporu). 50 katılımcı yerelde tamam (ACK p95 767 ms, maks 891; aşama farkı 23 ms). Orchestrator'ın 300 katılımcı koşusu **başarısız**: oyun başlamadan ~137. katılımda yerel Workers runtime çöktü; katılım süreleri katılımcı sayısıyla artıyor (her katılımda herkese tam görünüm). → **M7b** (oda performansı, 300 hedefi) Codex'e (medium) verildi; ölçüm hedefi tutmadan canlıya çıkılmaz.
- M3b ilk OpenCode oturumu bağlamı kaybedip uydurma özetle bitti (1/3 e2e geçiyordu). WIP commit'lendi; kalan e2e (geç seyirci, cihaz devri) dar kapsamlı yeni bir OpenCode oturumuna verildi.
- **M7b tamamlandı (kısmen hedefte):** Codex oda DO'sunu ölçeklendirdi: eşzamanlı komutlar tek kalıcı yazımda toplanıyor (ack yazımdan sonra), katılım/bağlantı/puan yayınları 4 Hz'de birleştiriliyor (aşama geçişleri anında), yönetici yetkisi yayın başına önbellekte; motorda puanlama yalnız değişen yolları kopyalıyor (davranış aynı, dondurulmuş durum testiyle). Yerel ölçümler (yük üreteci ve sunucu aynı makinede): 50 kişi ACK p99 756→64 ms. 300 kişi (16+284, lig 2 tur): önce ~137'de çöküyordu → artık tamamlanıyor, hata yok. Kopma yokken ACK p50/p95/p99/maks 190/467/869/1673 ms; yoğun kopmayla (1.475 yeniden bağlanma) p99 1,6 sn. Aşama farkı ≤ 250 ms (hedef ✓). **Açık:** ACK maks/p99 hedefin (≤1 sn) sınırında; botlar 284 kişinin aynı anda puanladığı en kötü durumu üretiyor. Gerçek Cloudflare'de ölçüm canlıya çıkmadan önce yapılacak (M7); gerekirse ek optimizasyon.
- M3b: yeni OpenCode oturumu e2e'yi bitirdi (3/3 geçti; geç seyirci testi test hatasıydı, cihaz devri erişilebilir ad uyuşmazlığı). main (M7b) birleştirildi, verify + e2e orchestrator tarafından doğrulandı. Orchestrator görsel kontrolünde 8 sorun (kürsü sırası ters, son turdan sonra 'Sonraki tur' metni ve ondalıklı saniye, ortak ekranda taşma/çakışmalar, final gözden geçirmede küçük resim yok, arayüzde 'SPEC 13.2', boş 'Eşleşmeler', ilk bağlantıda 'Yeniden bağlanıyor') → OpenCode'a düzeltme olarak verildi.
- **Owner kararı (2026-10-19): MVP kapasite hedefi oturum başına 100 katılımcı** ("300 bile şu an için çok iyimser… mvp olduğu için 100 oyunculu çalışsa yeterli"). Ürün katılımcı sayısını sınırlamaz; 100 yalnız doğrulama hedefi. SPEC Bölüm 17 ve plan M7 güncellendi. Doğrulama (yerel, 8 oyuncu + 92 seyirci, lig 2 tur, sık kopma — 222 yeniden bağlanma): tamamlandı, hata yok; ACK p50/p95/p99/maks 52/106/143/209 ms; aşama farkı maks 91 ms → hedefler rahat tutuyor. Gerçek Cloudflare ölçümü M7'de yine yapılacak.
- **M3b tamamlandı ve main'e alındı:** canlı katılımcı ekranları, ortak ekran (eşleştirme, 16:9 sahneler, köşe QR), ağ katmanı (üstel yeniden bağlanma, saat farkı), cihaz devri akışı, View'e `index/total` + `ownSubmissionId`, oda meme kütüphanesi ucu, 3 Playwright e2e (tam oyun, geç seyirci, cihaz devri). Görsel düzeltmeler doğrulandı. Açık (M4'e): gözden geçirmede gerçek "X/Y kişi bitirdi" için projeksiyona alan; "son tur mu" bilgisinin web'de türetilmesi yerine görünümde açık alan (eleme + gizleme kaynaklı beraberlikte uç durum).
- Orchestrator, konsol (M4) gelene kadar owner'ın deneyebilmesi için `pnpm demo` betiğini ekledi: tohumlama, sunucu + web (LAN'a açık), lobi, ekran kodu; terminalden başlat/rövanş/devir onayı.
- **M4 başladı (2026-10-19).** Owner: "kolay işler OpenCode glm-5.3-flash max, zor işler Codex gpt-6.1-sol low/medium". Bölünme: **M4a** işletme API'si + View eklemeleri (`review`, `isFinalRound`) → Codex medium; **M4b** yönetici konsolu (giriş + konsol, e2e) → OpenCode; **M4c** işletme paneli (ana sayfa, Durumlarım, Geçmiş, Hesap) → M4a birleşince OpenCode. Yeni sözleşme: `docs/contracts/business-api.md` v0.1. Konsol rotası `/isletme/oyun/:code`, giriş `/isletme/giris`.
- **M4a tamamlandı:** Codex işletme oturum listesi/detay/rapor ve Durumlarım uçlarını, paylaşılan şemaları (Türkçe normalizasyon, tekrar → `existingId`), View `review` ve `isFinalRound` alanlarını ekledi; 232 test. Not: link reddi `kelime.kelime` biçimini de reddediyor (ör. noktadan sonra boşluksuz yazım) — web hata mesajı bunu açıklamalı.
- M4b ilk OpenCode oturumu özetsiz yarıda bitti (~2.000 satır konsol kodu, 2 tip hatası). WIP commit'lendi, main (M4a) birleştirildi, yeni oturumla sürdürülüyor. Gözlem: glm-5.3-flash uzun işlerde bağlamı kaybediyor; görevleri daha küçük parçalara bölmek gerekebilir.
- **M4b tamamlandı:** yönetici girişi (`/isletme/giris`), konsol (`/isletme/oyun/:code`: durum çubuğu, Oyun/Katılımcılar/Ayarlar, aşama kartları, 1 sn basılı Hemen gizle, onaylı bitir, rövanş, masaüstünde sütunlar), e2e 4/4. Orchestrator görsel kontrolü: gösterim kartı o anki tek gönderi yerine tüm gönderileri listeliyor (View.presentation.index yöneticiye zaten geliyor) → M4c-1'e eklendi; lobi iptali localStorage yerine aktif oturum listesinden oturum kimliğini bulmalı → M4c-1.
- M4c-1 tamamlandı (panel düzeni, ana sayfa, hesap, lobi iptali sunucu listesinden; e2e 5/5). OpenCode haklı olarak durdu: yöneticinin `submissions` dizisi gösterim sırasında değil, index tek başına yetmez. **Orchestrator kararı:** `View.presentation.submissionId` eklendi (business-api v0.2; motor + shared + test, orchestrator yazdı). Şifre önerisi bandı: sunucuda ilk-giriş alanı yok, bant cihazda kapatılana kadar görünür (kabul).
- **M4 tamamlandı (2026-10-19).** M4c-2 (Durumlarım; konsol gösterim kartı `submissionId` ile tek gönderi) ve M4c-3 (Geçmiş listesi imleçli sayfalama + rapor detayı; e2e kısa oyunu API+WS ile oynatır) OpenCode ile bitti. Orchestrator doğrulaması: `pnpm verify` geçti, e2e 8/8 (`--trace on`), geçmiş ekranları görsel kontrol edildi. Not: jüri ödülleri ≥5 oyluk karne gerektirdiğinden e2e'de oluşmaz; birim testte sahte raporla kapsandı.
- **M5 medya hattı kararı (owner, 2026-10-19):** Meme ekleme owner'ın **kendi bilgisayarında** çalışan yerel araçla yapılır (Cloudflare Containers / ücretli plan yok; önceki "GitHub Actions" fikri de düştü). Araç admin girişiyle sunucuya yükler; sunucu R2'ye yazar ve medyayı sunar. **Platform durumları** admin panelinden metin olarak eklenir. Orchestrator varsayılanları: video kesme yerel araçta (25 sn üstü kesim aralığı olmadan eklenmez); kategori/açıklama verilmeyenler etiketlenmemiş kuyruğuna düşer, panelde hızlı etiketlenir. SPEC 6.1 ve 15.3 güncellendi.
- **M5 bölünmesi:** M5a sunucu (admin API'si tamamı + meme yükleme ucu + R2'den medya sunumu + kütüphanede medya adresleri) → Codex medium; M5b yerel medya aracı (`tools/media`) → Codex low, M5a ile paralel (yükleme ucu görev tanımında sabitlendi); M5c admin paneli (web) → M5a birleşince OpenCode, parçalı.
- **M5b tamamlandı:** `tools/media` yerel aracı (`pnpm media setup|login|add|import|update`, `--dry-run`). sudo'suz: ffmpeg/ffprobe npm statik paketlerinden, yt-dlp SHA-256 kontrollü önbelleğe. Video H.264/AAC MP4 ≤720 px + JPEG kapak; resimler JPEG (saydamlık korunmaz), GIF kalır; galeri gönderilerinde ilk öğe. Gerçek YouTube ve X linki indirilip dönüştürüldü; gerçek API/R2 yüklemesi M5a birleşince denenecek. Not: Codex worktree'de commit atamadı (git dizini sandbox'ta salt okunur), orchestrator commitledi.
- **M5a uygulaması (2026-10-19):** Admin işletme filtreleri/kullanım özeti, kriz araçları (DO üzerinden sonlandırma, atomik tek iade, admin çerezini koruyan işletme adına giriş (orchestrator 15 dk → 12 saate çıkardı)), oturum/işlem/hata raporları, kategori/platform durumu/işletme durumu denetimi ve meme yükleme/etiketleme uçları eklendi. `docs/contracts/admin-api.md` v0.1 taslağı ve `packages/shared/src/admin.ts` ortak şemaları incelemeye hazır. R2 medya sunumu ETag/HEAD/Range/immutable önbellekleme içeriyor; oda kütüphanesi medya adreslerini ve süreyi döndürüyor; katılımcı/ortak ekran gerçek medya ve video kapağına bağlandı. Yeni tablo yok: iki benzersizlik indeksi (kaynak URL, normalize platform durumu) ve gerçek hak düşümünü başlatma işaretinden ayıran nullable `credit_charged` alanı için Drizzle migration'ları var. `credit_consumed` önceden sınırsız oyunlarda da set edildiğinden, M5 öncesi kayıtların gerçek düşümü bilinmiyor; null için eski davranış korunuyor (CONTRACT-QUESTION). Yeni sınırsız oyunlar iade ile bakiye üretemiyor. Rapor depolama biçimi genişletilmedi; admin yanıtı özel medya kimliklerini çıkarır ve yedi gün geçmiş takma adları anonim gösterir. Admin paneli, yerel medya aracı, özel medya temizliği ve uzak Cloudflare işlemleri kapsam dışında kaldı.
- **M5a doğrulama:** Son `pnpm verify` geçti (137 motor + 5 shared + 98 sunucu + 72 web + 5 yük aracı = 317 test; typecheck/lint/build başarılı). Mevcut Playwright E2E 8/8 geçti (2,9 dk); 8787/5173 test sunucuları kapandı. Temiz yerel ortamda Wrangler log/registry yolları `/tmp` altına alındı; `.dev.vars` sunucu başlamadan hazırlandı. `git diff --check` temiz. Commit denendi fakat worktree Git metadata dizini salt okunur olduğundan `index.lock` oluşturulamadı; commit/push yapılmadı. CONTRACT-QUESTION: v0.1 sözleşmesi ve eski sınırsız oyunların bilinmeyen gerçek düşümüne yönelik geriye uyum davranışı orchestrator incelemesinde; yeni SPEC-QUESTION yok.
- **M5a birleşti (orchestrator incelemesi):** `admin-api.md` v0.1 onaylandı; tek değişiklik: işletme adına giriş süresi 15 dk → 12 saat (canlı müdahale oyun boyunca sürebilir; admin her şeyin sahibi). `credit_charged` geriye uyum sorusu: canlıda veri yok, mevcut davranış kabul. Uçtan uca yerel deneme: `pnpm media` ile .mov dosyası, PNG (etiketsiz → kuyruk) ve gerçek YouTube linki sunucuya yüklendi; aynı videonun kısa linki mükerrer yakalandı; `/media` Range `206` ve immutable önbellek doğru; katılımcı seçim ekranında gerçek videolar kapaklı oynuyor. Bulgu: R2'de dosyası olmayan tohum meme'leri kırık resim simgesi gösteriyor → M5c-1'e eklendi (yer tutucu + tohuma gerçek dosya). verify geçti, e2e 8/8.
- **M5c başladı:** admin paneli (web), OpenCode, üç parça (`docs/tasks/m5c-admin-panel.md`).
- M5c-1 tamamlandı (admin girişi, düzen, genel bakış, işletmeler; MemeFrame 'Bu cihazda yüklenemedi' yer tutucusu; e2e tohum meme'leri yerel R2'de gerçek dosya; e2e 10/10). Orchestrator görsel kontrolü: mobil düzen iyi; arama alanında fazladan kutu → M5c-2'ye eklendi. Etiketlenmemiş sayısı 100'lük sayfayla ölçülüyor ("100+"), kabul.
- **Worker modeli değişti (owner, 2026-10-19):** OpenCode bundan sonra `opencode-go/deepseek-v4.1-flash#max` ile çalışır (glm-5.3-flash yerine). O sırada süren M5c-2 glm ile tamamlanır; M5c-3'ten itibaren deepseek.
- M5c-2 tamamlandı (glm): kategoriler, platform durumları, işletme durumu engelleme, meme kütüphanesi, hızlı etiketleme (Ctrl/⌘+Enter, 1–9, Esc); arama alanı hatası (GhostButton w-full) ortak `SearchForm` ile giderildi, Durumlarım da düzeldi. e2e 16/16. Orchestrator görsel kontrolü: etiketleme ve kütüphane ekranları iyi.
- **M5 tamamlandı (2026-10-19).** M5c-3 (deepseek-v4.1-flash, ~20 dk, ilk denemede temiz): oturum listesi/detayı (SPEC 15.4), sonlandır, hak iadesi, kullanım özeti, sistem kayıtları. Orchestrator doğrulaması: verify geçti, e2e 17/17 (--trace on), telefon ve 1280 masaüstü görsel kontrolü iyi. Not: tarih alanları tarayıcı diline göre biçimlenir (Playwright'ta mm/dd/yyyy, Türkçe tarayıcıda gg.aa.yyyy).
- **M6 başladı (2026-10-19).** Motor özel içeriği zaten destekliyor (MediaRef upload/youtube, rejectCustom, gizleme telafisi). Bölünme: M6a sunucu + protokol (yükleme, EXIF temizliği, YouTube doğrulama, görünürlük, özel medya erişimi, oturum sonunda silme, medya hata kaydı) → Codex medium; M6b web (Yükle / YouTube kırpma / oynatma / konsol canlı liste + reddet / tam e2e) → M6a sonrası OpenCode deepseek, parçalı.
