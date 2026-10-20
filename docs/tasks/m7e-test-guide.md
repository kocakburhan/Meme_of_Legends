# Görev: M7e — Proje ortağı için test ve kullanım rehberi (Word)

Worker: Codex (gpt-6.1-sol, medium) · Dal: `m7e-test-guide`

## Okuyucu
Owner'ın proje ortağı. Platform admin'i (aynı `mol-admin` hesabını kullanır), **teknik değil**: terminal, Git, Node bilmiyor varsayılmalı. Sistemi ilk kez görecek, tüm ekranları (admin paneli dahil) test edecek ve meme/durum içeriğini girecek. Dil: Türkçe, sade, adım adım, her ekranda "ne görmelisin" anlatımı.

## Çıktı
`docs/Meme_of_Legends_Test_Rehberi.docx` (python-docx ile üret: `uv run --with python-docx python <betik>`; betiği `tools/docs/build_test_guide.py` olarak sakla ki sonra güncellenebilsin). Başlıklar Word stilleriyle (Başlık 1/2/3) ve içindekiler tablosu alanı; test adımları numaralı; her test bölümünde **onay kutulu kontrol listesi** (☐) ve "Beklenen sonuç" satırları; tablolar okunur. Ekran görüntüsü gerekmez.

## Kaynaklar (doğru bilgi için oku, uydurma)
docs/PRODUCT_SPEC.md (tamamı), docs/PROJECT_LOG.md (son bölümler: canlı ortam, M5 medya kararı), apps/web/src/App.tsx (rotalar), tools/media/README.md, apps/server/README.md (Canlı ortam), docs/contracts/admin-api.md, custom-content.md. Arayüz metinlerini (düğme adları vb.) gerektiğinde web kaynağından birebir al.

## İçerik
1. **Giriş:** Meme of Legends nedir (2–3 paragraf), roller (admin, işletme yöneticisi, oyuncu, seyirci, ortak ekran), kısa sözlük (oda kodu, durum, gönderi, tur, lig/eleme/hibrit, özel içerik, ortak ekran, konsol). Canlı adres: https://mol-game.kocakkburhann.workers.dev ; admin girişi `/admin/giris`, işletme girişi `/isletme/giris`, ortak ekran `/ekran`. Admin kullanıcı adı `mol-admin`; **şifre bu belgede yok, owner ayrıca iletir.**
2. **Hazırlık:** gerekenler (1 bilgisayar, 3–4 telefon ya da tarayıcıda gizli pencereler, ortak ekran için ikinci ekran/TV ya da ayrı tarayıcı penceresi), önerilen tarayıcılar, aynı anda birden çok "kişi" olmanın yolları (farklı telefonlar; aynı bilgisayarda farklı tarayıcı profilleri/gizli pencere).
3. **İlk kurulum içeriği (yapılması gerekenler):** kategori oluşturma; platform durumları ekleme (en az 30 önerilir; az durum uyarısı); meme ekleme (bölüm 4); bir test işletmesi açma.
4. **Kendi bilgisayarından meme ekleme (yerel araç), adım adım:** Node.js 22+ kurulumu (Windows/macOS/Linux ayrı kısa adımlar, resmi site), pnpm'i etkinleştirme (`corepack enable`), depoyu edinme (GitHub erişimi owner'dan ya da zip), klasörde terminal açma, `pnpm install`, `pnpm media setup`, `pnpm media login --server https://mol-game.kocakkburhann.workers.dev`, `pnpm media add <link> --category <ad> --description "<açıklama>"`, `--start/--end` ile kesme (25 sn kuralı), `pnpm media import links.txt` (dosya biçimi, rapor dosyası), `--dry-run`, `pnpm media update` (yt-dlp güncelleme; indirme bozulunca ilk çare), sık hata mesajları ve anlamları (README'deki gerçek mesajlar), etiketlenmemiş kuyruğu → panelde Hızlı etiketleme. Not: Windows'ta araç henüz denenmedi; sorun olursa owner'a bildirsin.
5. **Admin paneli testleri** (her biri: adımlar + beklenen sonuç + ☐): giriş/hatalı giriş/çıkış; Genel bakış; İşletmeler (oluştur, giriş bilgisini kopyala, hak ekle/çıkar, sınırsız hak, eşzamanlı oturum sınırı, lobi ömrü, pasife al, şifre sıfırla, adına giriş); Oturumlar (liste/filtre, detay, Sonlandır, Hakkı iade et, Kullanım); İçerik (kategoriler: ekle/yeniden adlandır/sırala/arşivle; platform durumları: ekle, aynı metni tekrar ekleme, arşivle/geri al, arama; işletme durumları: engelle/kaldır; meme kütüphanesi: arama, filtre, düzenle, arşivle; Hızlı etiketleme ve klavye kısayolları); Sistem (hata ve işlem kayıtları). Telefonda da panelin açıldığını kontrol.
6. **İşletme paneli testleri:** test işletmesiyle giriş, şifre değiştirme önerisi ve şifre değiştirme, Ana sayfa (kalan hak, Yeni oyun, Oyuna dön), Durumlarım (ekle/tekrar/arşivle/geri al/ara), Geçmiş ve oyun detayı, Hesap/çıkış.
7. **Tam oyun senaryoları** (en önemli bölüm): hazırlık (konsolda lobi, ortak ekranı eşleştirme kodu ile bağlama, QR/kodla telefonlardan katılma, oyuncu/seyirci seçimi); Senaryo A — Lig, 3 oyuncu + 1 seyirci, 1 tur, tam akış (seçim: kütüphane; gösterim ve 1–5 puan; final gözden geçirme; sonuç; oyun sonu; rövanş); Senaryo B — Özel içerik açık: resim yükleme, YouTube linki + kırpma (25 sn), yöneticinin reddetmesi ve oyuncunun yeniden seçmesi, gösterimde YouTube'un oynaması; Senaryo C — Eleme modu 4 oyuncu; Senaryo D — Hibrit (mümkünse 6+ oyuncu); Senaryo E — konsol araçları: süre ekleme, durumu değiştirme (önizleme ve acil), Hemen gizle (1 sn basılı tut), oyuncuyu seyirciye alma, atma, takma ad sıfırlama, duraklat/devam, oyunu bitir; Senaryo F — sorun durumları: telefonu yenileme/yeniden bağlanma, aynı adla başka cihazdan devam (yönetici onayı), oyun sürerken seyirci katılması (o turu puanlayamaz), ortak ekran kopup geri gelmesi, internet kısa kesilmesi. Her senaryoda kim ne yapar tablosu + beklenen sonuçlar + ☐. Kurallar özetini SPEC'ten doğru aktar (puanlama, düello, beraberlik, süreler) ama kısa tut.
8. **Erişilebilirlik ve görünüm kontrolleri (kısa):** telefon/masaüstü, yatay/dikey, yazı büyütme, klavye ile gezinme (masaüstü).
9. **Hata bildirme:** şablon (tarih-saat, cihaz/tarayıcı, ekran, oda kodu, adımlar, beklenen/gerçekleşen, ekran görüntüsü/video); acil durumlar (oyun takıldıysa admin panelinden Sonlandır).
10. **Test sonrası temizlik:** test işletmelerini pasife alma, test durum/meme'lerini arşivleme. Mevcut test kayıtları: "Yük testi (orchestrator)" işletmesi ve "Canlı test …" işletmeleri, "Toplantı yine uzayınca" durumu.

## Kurallar
Kod değişikliği yok (yalnız `tools/docs/build_test_guide.py` ve .docx). Uydurma özellik yazma; emin olmadığın düğme adını kaynaktan doğrula. `pnpm verify` geçmeli (betik Python, TS'yi etkilemez). Commit at (yazamıyorsan bırak); push yok.

## Teslim
Kısa özet: bölümler, sayfa/kelime sayısı yaklaşık, emin olunamayan noktalar.
