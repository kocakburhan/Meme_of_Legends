# Meme of Legends — Ürün Spesifikasyonu

- **Sürüm:** v2 taslak, 2026-10-18
- **Durum:** Owner tarafından onaylandı (2026-10-18)
- **Kaynak:** `docs/old/` altındaki 2026-08-10 tasarımı + `docs/PROJECT_LOG.md` içindeki kararlar. Bu doküman onaylandığında `docs/old/` geçersiz olur ve silinir.
- **Kapsam:** Ürün davranışı ve oyun kuralları. Ekran tasarımı, görsel dil ve teknoloji seçimleri ayrı aşamalarda belirlenir (bkz. Bölüm 20).

---

## 1. Özet

Meme of Legends, işletmelerin (kafe, bar, üniversite, şirket, etkinlik organizatörü) düzenlediği, tarayıcıda oynanan canlı bir meme yarışmasıdır.

Her turda sistem bir **durum** gösterir (ör. "Maaşın yattığı an"). Oyuncular bu duruma en uygun meme'i seçer: sistem kütüphanesinden bir meme, kendi yükledikleri bir resim/GIF ya da bir YouTube klibi. Gönderiler anonim olarak sırayla gösterilir ve katılımcılar her birini 1–5 arasında puanlar. Puanlar seçilen oyun moduna (eleme, lig, hibrit) göre kazananı belirler.

Ürün herkese açık bir tüketici oyunu değildir. İşletme hesaplarını platform admin açar ve oyun hakkı tanımlar. Katılımcılar uygulama indirmeden ve hesap açmadan QR kod veya oda koduyla katılır. Hedef pazar Türkiye'dir; arayüz yalnız Türkçedir.

### 1.1 Temel ilkeler
1. **Oyun kendi kendine akar.** Oyun başladıktan sonra hiçbir an yönetici müdahalesini beklemez. Yönetici kolaylaştırıcıdır, zorunlu değildir.
2. **Sunucu otoritedir.** Zamanlayıcılar, roller, aşama geçişleri, eşleşmeler, oy kilitleme, puanlama ve kurtarma sunucudadır. İstemciler durumu gösterir ve yetkili komut gönderir.
3. **Kullanıcı süreyle sınırlanmaz.** Oyunlar kısa sürecek şekilde tasarlanır ama kod süre üzerinden kısıt koymaz; tahmini süre gösterilir, karar yöneticidedir.
4. **Admin platformun sahibidir.** İstediği işletmeye istediği imtiyazı verebilir, krizleri panelden tek hamlede çözer. İşletmelere karşı bonkör davranılır.
5. **Riski topluluk seçer.** İçerik filtresi yoktur; özel içeriği istemeyen işletme kapatır.

### 1.2 Terimler

| Terim | Anlamı |
|---|---|
| Oturum | Bir işletmenin açtığı lobi + oyun. Bir oyun hakkına karşılık gelir. |
| Oda | Katılımcıların oda kodu/QR ile girdiği alan. Rövanşta aynı oda yeni oturuma taşınır. |
| Tur | Bir durum için seçim → gösterim → final gözden geçirme → sonuç döngüsü. |
| Aşama | Turlardan oluşan bölüm (lig aşaması, yarı final, final). |
| Düello | İki oyuncunun doğrudan karşılaştığı eşleşme (eleme eşleşmesi, hibrit yarı final/final, 2 oyunculu lig). |
| Gönderi | Bir oyuncunun bir turdaki meme seçimi. |
| Durum | Turun konusu olan kısa metin. |
| Uzatma turu | Beraberliği çözmek için oynanan ek tur. |

---

## 2. Roller

### 2.1 Platform admin
- **Tek bir admin hesabı** vardır; sunucu tarafında bir komutla oluşturulur, panelden oluşturulamaz. Owner ve proje ortağı bu hesabı ortak kullanır.
- Giriş: kullanıcı adı + güçlü şifre.
- Yetkileri Bölüm 15'te.

### 2.2 İşletme yöneticisi
- Admin'in verdiği kullanıcı adı ve geçici şifreyle giriş yapar; şifresini değiştirebilir.
- Kalan oyun hakkını görür, oturum açar/yönetir, kendi durum kütüphanesini ("Durumlarım") yönetir, geçmiş oturum özetlerini görür.
- Aynı hesap aynı anda birden fazla cihazda açılabilir (ör. dizüstü + telefon).
- Tüm yönetici akışı telefondan eksiksiz yapılabilmelidir. Masaüstü daha fazla bilgi gösterebilir ama yalnız masaüstünde olan bir yetenek olmamalıdır.
- Yönetici aynı zamanda oyuncu olabilir (Bölüm 14.3).

### 2.3 Oyuncu
- Hesapsız katılır, benzersiz bir takma adla oyuncu olmak ister.
- Her turda bir gönderi yapar; kendi gönderisi dışındakileri puanlar (düello kuralı saklı, Bölüm 8).
- Elenirse, yarışmayı bırakırsa veya seyirciye alınırsa seyirci olur.

### 2.4 Seyirci
- Hesapsız katılır, benzersiz bir takma adla girer. Oyun sürerken de katılabilir.
- Gönderi yapmaz; puanlar.

### 2.5 Ortak ekran
- İsteğe bağlıdır. Projektör veya TV'de oyunu gösterir; hiçbir yönetim kontrolü yoktur.
- Koparsa oyun durmaz.

---

## 3. İşletme Hesabı, Oyun Hakları ve İmtiyazlar

### 3.1 Hesap açma
1. Admin işletmeyi **tek bir kısa formla** oluşturur: işletme adı, benzersiz kullanıcı adı, başlangıç hak sayısı. Geçici şifre sistem tarafından önerilir (admin değiştirebilir). Hesap varsayılan olarak aktiftir.
   - Kayıt sonrası giriş bilgileri (giriş adresi, kullanıcı adı, geçici şifre) tek tuşla kopyalanabilir bir özet olarak gösterilir; admin bunu doğrudan işletmeye iletir.
   - İşletme kendi kimlik bilgileriyle giriş yapar, ilk girişte şifresini değiştirmesi önerilir.
2. İşletme kendi kendine kayıt olamaz; ödeme/abonelik yoktur.
3. İşletme şifresini değiştirebilir. Değişikliği yaptığı cihaz açık kalır, diğer cihazlardaki girişleri kapanır.

### 3.2 Oyun hakları
- Bir oyun hakkı **oyun başlatılınca** düşer. Lobi oluşturmak hak tüketmez.
- Başlat'a basınca onay gösterilir: "1 oyun hakkın düşecek, kalan: N".
- Hakkı 0 olan işletme lobi açamaz; başlat anında hak yeniden kontrol edilir.
- Erken bitirilen veya otomatik sonlanan oyunda hak kendiliğinden iade edilmez; admin iade edebilir.
- Deneme modu yoktur; deneme isteyen işletmeye admin ek hak verir.

### 3.3 İşletme imtiyazları (admin tarafından, işletme bazında)

| İmtiyaz | Varsayılan |
|---|---|
| Oyun hakkı (ekle/çıkar veya sınırsız) | Admin'in verdiği sayı |
| Aynı anda aktif oturum (lobi veya oyun) sayısı | 1 |
| Başlatılmamış lobi ömrü | 24 saat |

### 3.4 Hesap durumu değişiklikleri
- **Pasife alma:** Yöneticinin tüm girişleri kapanır, yeni oturum açılamaz, açık lobi kapanır. Süren oyun sonuna kadar devam eder (admin isterse sonlandırır).
- **Admin şifre sıfırlaması:** Yöneticinin tüm girişleri kapanır; süren oyun etkilenmez.

---

## 4. Oturum Yaşam Döngüsü

### 4.1 Durumlar
`LOBİ → OYUN (↔ DURAKLATILDI) → BİTTİ`; ayrıca `LOBİ → İPTAL` ve `OYUN → SONLANDIRILDI`. Kesin durum makinesi teknik tasarımda belirlenir.

### 4.2 Lobi
- Yönetici oturumu oluşturunca oda kodu ve QR üretilir.
- Mod ve tüm ayarlar lobide serbestçe değiştirilebilir.
- Yönetici lobiyi istediği an iptal edebilir (hak düşmediği için kayıp yok).
- Başlatılmamış lobi, ömrü dolunca (varsayılan 24 saat) kendiliğinden kapanır.

### 4.3 Ayarlar

| Ayar | Değerler | Varsayılan | Oyun sırasında |
|---|---|---|---|
| Oyun modu | Eleme / Lig / Hibrit | Hibrit | Kilitli |
| Lig tur sayısı (yalnız lig modu) | 1–50 | 10 | Kilitli |
| Seçim süresi | 30–240 sn | 60 sn | Değişebilir, sonraki turdan geçerli |
| Final gözden geçirme süresi | 15–120 sn | 45 sn | Değişebilir, sonraki turdan geçerli |
| Özel içerik | Açık / Kapalı | Açık | Değişebilir, sonraki turdan geçerli |
| Oyuncu onayı | Açık / Kapalı | Kapalı (otomatik kabul) | Değişebilir |
| Seyirci onayı | Açık / Kapalı | Kapalı | Değişebilir |
| Yeni seyirci kabulü | Açık / Kapalı | Açık | Değişebilir |

- Özel içerik ayarının yanında kısa açıklama: "Oyuncular kendi resim, GIF ve YouTube içeriklerini ekleyebilir."
- Lig tur sayısındaki 50 yalnız hatalı girişe karşı güvenlik sınırıdır.
- **Tahmini süre:** Ayar ekranında mod, oyuncu sayısı ve tur sayısına göre tahmini süre aralığı gösterilir ve canlı güncellenir.

### 4.4 Oyunu başlatma
"Başlat" düğmesi koşulları denetler; sağlanmazsa pasif kalır ve nedenini yazar:
- Tüm modlarda en az 2 oyuncu.
- Hibrit modda en az 4 oyuncu.
- Seyirci şartı yoktur; oyun yalnız oyuncularla oynanabilir.
- Başlarken bekleyen oyuncu istekleri seyirciye dönüşür, kişiye bildirim gösterilir.
- Başlayınca oyuncu kadrosu kilitlenir; yeni gelenler yalnız seyirci olabilir.

### 4.5 Bitiş ve otomatik sonlanma
- Mod sonucu belirlenince oyun biter; final ekranı (kürsü + jüri ödülleri) gösterilir.
- Herhangi bir modda aktif oyuncu sayısı 2'nin altına düşerse oyun hemen biter; kalan oyuncu varsa şampiyondur. Hiç kalmazsa oyun şampiyonsuz biter.
- Başlamış oyunda 10 dakika boyunca bağlı hiçbir oyuncu veya seyirci yoksa (yönetici konsolu ve ortak ekran sayılmaz) oyun otomatik sonlanır.
- Yönetici oyunu istediği an erken bitirebilir (onaylı).

### 4.6 Rövanş
- Oyun bitince yönetici tek tuşla aynı odada yeni bir lobi açabilir. Oda kodu korunur.
- Katılımcılar odadan çıkmadan yeni lobiye geçer; oyuncu olmak isteyenler yeniden istek gönderir.
- Yeni oyun başlatılınca normal kuralla 1 hak düşer.

---

## 5. Katılım

### 5.1 Oda kodu ve QR
- Oda kodu 6 karakterdir; birbirine karışan karakterler (0/O, 1/I vb.) kullanılmaz.
- QR, oda kodunu içeren bir linktir; QR ile gelen kod girmez.
- Oturum bitince kod geçersiz olur; rövanşta korunur.

### 5.2 Katılım akışı
1. Kişi QR veya oda koduyla girer.
2. Takma adını yazar. Altında kısa bir bilgilendirme satırı ve aydınlatma metni linki bulunur (ayrı onay kutusu yok).
3. "Oyuncu" veya "Seyirci" seçer.
   - **Oyuncu:** Oyuncu onayı kapalıysa doğrudan kabul edilir; açıksa yönetici onay kuyruğuna girer, reddedilirse seyirci olur.
   - **Seyirci:** Seyirci onayı kapalıysa doğrudan girer; açıksa onay bekler. Yeni seyirci kabulü kapalıysa giremez.
4. Oyun başlamışsa yalnız seyirci seçeneği sunulur.

### 5.3 Takma ad
- 2–20 karakter; harf, rakam, boşluk, emoji. Link kabul edilmez.
- Oda içinde benzersizdir (büyük/küçük harf duyarsız).
- Otomatik küfür filtresi yoktur; yönetici "takma adı sıfırla" ile müdahale eder.

### 5.4 Oyuncu sayısı
- Ürün sınırı yoktur; yalnız 1000 oyunculuk teknik güvenlik sınırı vardır.

### 5.5 Kimlik ve yeniden bağlanma
- Her tarayıcıya tek bir katılımcı kimliği verilir; aynı tarayıcıdan ikinci katılım yapılamaz.
- **Aynı cihaz:** Yenileme veya kısa kopmada kişi otomatik olarak aynı rol ve durumla döner.
- **Yeni cihaz:** Kişi kendi takma adıyla girmeye çalışınca "Bu ad kullanımda. Sen misin? Yöneticiden devam onayı iste" seçeneği çıkar. Yönetici onaylarsa yeni cihaz kimliği (rol, puanlar, o turun seçimi, oy hakkı) devralır; eski cihaz düşer.
- Bağlantısı kopan oyuncu otomatik çıkarılmaz; gönderi yapmadığı turlardan 0 alır.

### 5.6 Seyirci hilesine karşı önlemler
Amaç hileyi imkânsız kılmak değil, zahmetli ve görünür kılmaktır. Arkadaşların seyirci olarak gelip bir oyuncuyu desteklemesi hile sayılmaz.
- Tarayıcı başına tek kimlik (gizli sekme / farklı tarayıcı riski kabul edilir).
- Seyirci sayısı ortak ekranda görünür; yönetici konsolunda seyirci listesi ve katılım saatleri bulunur.
- Yönetici seyirciyi odadan atabilir, yeni seyirci kabulünü kapatabilir, seyirci onayını açabilir.
- **Geç katılım kuralı:** Bir turun gönderi gösterimi başladıktan sonra katılan seyirci o turu izler ama puanlayamaz (final gözden geçirme dahil); sonraki turdan itibaren puanlar. Seçim aşamasında katılan o turda puanlayabilir.
- IP sınırlama, cihaz parmak izi ve şüpheli oy tespiti yapılmaz.

---

## 6. İçerik

### 6.1 Sistem meme kütüphanesi
- Resim, GIF ve video içerir. Tüm dosyalar **kendi depolamamızda** tutulur (hedef: Cloudflare R2). Dış platform bağımlılığı yoktur.
- Videolar yükleme/içe aktarma sırasında tüm hedef tarayıcılarda oynayan tek biçime dönüştürülür, küçültülür, kapak görseli çıkarılır. En fazla 25 sn'dir; daha uzunsa admin başlangıç/bitiş seçer ve dosya kesilir.
- **İçerik ekleme yolları:**
  - **Linkten ekle:** Admin bir X, Instagram veya YouTube linki yapıştırır; sistem içeriği arka planda indirir, dönüştürür ve depolamaya yükler (ilerleme gösterilir). Admin bu sırada kategori seçer ve açıklama yazar; hazır olunca önizler (gerekirse keser) ve ekler. İçerik doğrudan kütüphaneye girer. İndirilemeyen içerik (silinmiş, gizli, giriş gerektiren vb.) için net hata gösterilir.
  - **Dosya yükleme:** Panelden tekli veya çoklu (sürükle-bırak).
  - **Toplu içe aktarma:** Link listesi veya dosya klasörü verilir; hepsi işlenir, indirilemeyenler raporlanır.
- Dosya yükleme ve toplu içe aktarmayla gelenler **etiketlenmemiş kuyruğuna** düşer; kategori ve açıklama girilene kadar oyunda görünmez. Hızlı etiketleme ekranı içerikleri tek tek getirir (büyük önizleme, kategori, açıklama, kaynak link, kesme aracı, "Kaydet ve sıradakine geç", klavye kısayolları).
- **Meta veri:** Her öğenin **kategorisi** ve **açıklaması** vardır; açıklama kartta başlık olarak görünür ve aramada kullanılır. Ayrı etiket alanı yoktur. Orijinal kaynak linki saklanır (mükerrer kontrolü, yeniden indirme).
- Tüm aktif sistem meme'leri her oturumda kullanılabilir; paket, yaş etiketi veya ortam filtresi yoktur. Kategoriler yalnız gezinmeyi kolaylaştırır.
- Aynı turda birden fazla oyuncu aynı meme'i seçebilir; bir oyuncu aynı meme'i sonraki turlarda tekrar kullanabilir.
- İçerik silinmez, arşivlenir; geçmiş kayıtlar her zaman çözümlenebilir kalır.

### 6.2 Durumlar
- Bir durum ya **platforma** (admin yönetir) ya da **bir işletmeye** ("Durumlarım") aittir.
- **İşletme durumları:**
  - Düz metin ve emoji; 3–160 karakter. Link, HTML ve zengin metin reddedilir.
  - Sayı sınırı yoktur; liste aranabilir, filtrelenebilir, sayfalanır.
  - Aynı işletmede birebir tekrar reddedilir (büyük/küçük harf, baş/son boşluk ve fazla boşluklar normalize edilerek). Benzer durumlar ve platform durumlarıyla eşleşme serbesttir.
  - İşletme oluşturur, düzenler, arşivler, yeniden etkinleştirir. Değişiklik geçmişi tutulmaz. Hemen aktif olur; ön onay ve otomatik filtre yoktur.
  - Admin tüm işletme durumlarını görebilir, engelleyebilir, engeli kaldırabilir; metni düzenleyemez. Engelli durum işletme tarafından düzenlense de admin açana kadar engelli kalır.
- **Platform durumları:** Admin oluşturur, düzenler, arşivler. Aktif platform durumu azaldığında admin panelinde uyarı gösterilir (sert alt sınır yok).

### 6.3 Durum havuzu ve çekim
- Her turun durumu **o anda** aktif olan havuzdan çekilir: aktif platform durumları + oturumu açan işletmenin aktif durumları. Oyun başında dondurma yoktur; admin engeli ve arşivleme süren oyunlarda da hemen etkilidir.
- Her durumun seçilme olasılığı eşittir; platform/işletme ağırlıklandırması yoktur.
- Oturumda havuz bitene kadar hiçbir durum tekrar etmez. Havuz bitince en uzun süre önce kullanılanlar arasından rastgele seçilir; oyun "durum kalmadı" diye takılmaz.
- Uzatma turları da havuzdan çeker.
- Oturum geçmişi, durumun oynandığı andaki metnini saklar.

### 6.4 Durum değiştirme
- Tur başına **1 değiştirme hakkı** vardır (uzatma turları dahil).
- **Önizleme:** Bir sonraki turun durumu, önceki turun sonuç ekranı süresince yönetici konsolunda görünür (ilk tur için lobide). Burada değiştirilirse oyuncular fark etmez.
- **Acil değiştirme:** Hak kullanılmadıysa seçim aşamasının ilk 15 sn'sinde kullanılabilir; oyuncu seçimleri sıfırlanır, seçim süresi baştan başlar.
- Yeni durum havuzdan rastgele çekilir; yönetici durumu kendisi seçmez. Değiştirilen durum o oturumda kullanılmış sayılır.

---

## 7. Tur Akışı

Her tur sırasıyla: **seçim → gönderi gösterimi → final gözden geçirme → sonuç**.

### 7.1 Seçim
- Durum, seçim boyunca ekranın üstünde görünür.
- Oyuncu sistem kütüphanesinde arama ve kategorilerle gezinir, önizler ve seçimini açıkça onaylar. Onaylanan seçim, aşama açık olduğu sürece değiştirilebilir.
- **Özel içerik** (ayar açıksa):
  - Resim/GIF yükleme: JPG, PNG, WebP, GIF; en fazla 10 MB. Yüklenen dosyadan EXIF/konum gibi meta veriler silinir.
  - YouTube linki: herkese açık ve gömülebilir olmalıdır; değilse önizlenemediği için reddedilir. Oyuncu dokunmatik bir zaman çizelgesinde başlangıç/bitiş seçer (en fazla 25 sn), önizler, gerekirse düzeltip onaylar.
  - Video dosyası yüklenemez.
  - Özel içerik seçim boyunca yalnız sahibine görünür; diğerleri onu yalnız anonim gönderi olarak görür. Merkezi kütüphaneye hiçbir zaman girmez.
- **Yönetici denetimi:** Seçim aşamasında gelen özel içerikler yönetici konsolunda gönderen adıyla canlı listelenir. Yönetici bir içeriği reddedebilir; oyuncu "Bu içerik kabul edilmedi" bildirimi alır, süre varsa yeniden seçer, yoksa o turdan 0 alır. Yönetici bakmazsa hiçbir şey beklemez.
- **Erken bitiş:** Tüm aktif oyuncular onaylarsa seçim erken biter.
- **Süre dolunca:** Oyuncunun son geçerli seçimi (onaylamamış olsa da) gönderilir. Geçerli seçimi yoksa o turdan 0 alır.
- Yönetici süren seçim aşamasına +15 / +30 / +60 sn ekleyebilir; süren sayacı kısaltamaz.
- Eleme modunda bay geçen oyuncu ve uzatma turunda berabere kalmayanlar gönderi yapmaz.
- Gönderi yapmayanlar (seyirciler dahil) seçim boyunca durumu ve oyuncuların canlı "hazır" işaretlerini görür; isterse kütüphaneye göz atabilir.

### 7.2 Gönderi gösterimi
- Sunucu her turda gönderi sırasını rastgele belirler; tüm istemciler aynı sırayı görür. Sıra oyuncu, lobi veya tablo sırasını izlemez.
- Gönderen, oylar kilitlenene kadar gizlidir.
- Her gönderi bir **gösterim slotu** alır; durum üstte, gönderi altta, puanlama aynı ekrandadır:
  - **Resim / GIF:** 12 sn izle-puanla + 3 sn "son karar" = 15 sn. Resim sabit kalır, GIF döner.
  - **Video:** izleme süresi = klip süresi, en az 12 sn (daha kısa klip son karesinde durur) + 5 sn "son karar" = 17–30 sn. Video bir kez oynar; seçilen bitiş noktasından önce kesilmez.
- Puanlama 1–5 numaralı büyük düğmelerle tek dokunuşla yapılır ve değiştirilebilir.
- "Son karar" bölümünde puanlar hâlâ değiştirilebilir; ekran bunu vurgular.
- Gösterim sırasında kaç kişinin puan verdiği canlı gösterilir ("23/30 kişi puan verdi"); puanlar ve ortalama gösterilmez.
- Sonraki medya mümkün olduğunca önceden yüklenir.
- Aşama zamanlaması sunucuda senkronizedir; üçüncü taraf oynatıcıların cihazlar arası kare-kare senkronu garanti edilmez.
- Yükleyemeyen cihaz bir kez daha dener; olmazsa "Bu cihazda yüklenemedi" gösterir. Oyun durmaz.

### 7.3 Final gözden geçirme
- Tüm gönderiler gösterildikten sonra ayarlanan süre boyunca açılır.
- Katılımcılar kaçırdıkları gönderileri yeniden açabilir, eksik puanlarını tamamlayabilir, verdikleri puanları değiştirebilir. Eksik puanlar vurgulanır ama zorunlu değildir.
- Gönderenler hâlâ gizlidir.
- Tüm **bağlı** uygun katılımcılar "Bitirdim" derse aşama kapanır. Yönetici erken kapatabilir.
- Aşama bitince oylar kilitlenir.

### 7.4 Sonuç
- Kilitlemeden sonra gönderenler, ortalama puanlar (2 ondalık) ve geçerli oy sayıları açıklanır; moda uygun tablo gösterilir.
- Sonuçlar 1–2 sn arayla **sırayla açıklanır** (düellolar / puanlar), ardından tablo gelir. Ortak ekran ve telefonlar senkron gösterir.
- Sonuç ekranı, açıklama bittikten sonra **15 sn geri sayımla** kendiliğinden sonraki tura geçer. Yönetici hemen geçebilir veya bekletebilir (bekletme bir duraklatmadır, Bölüm 12.2).

---

## 8. Puanlama

### 8.1 Kim neyi puanlar
- Hiçbir oyuncu kendi gönderisini puanlayamaz.
- **Lig bağlamı** (lig modu ve hibritin lig aşaması, 3+ oyuncu): oyuncular kendi gönderisi dışındaki tüm gönderileri puanlar.
- **Düello bağlamı** (eleme eşleşmesi, hibrit yarı final ve final, 2 oyunculu lig): düellodaki iki rakip birbirinin gönderisini puanlayamaz; o turdaki diğer gönderileri puanlayabilir.
- **İstisna:** Bir düelloyu puanlayabilecek tarafsız bir katılımcı odada yoksa, iki rakip birbirini puanlar. Kontrol her turun gönderi gösterimi başlarken yapılır.
- Seyirciler, bay geçen oyuncular ve elenip seyirciye dönen oyuncular her zaman tarafsız puanlayıcıdır.
- Seyircilerin puanlaması geç katılım kuralına tabidir (5.6).
- Her geçerli oyun ağırlığı eşittir.

### 8.2 Puan hesabı
- Gönderi puanı, geçerli 1–5 puanların aritmetik ortalamasıdır. Hesaplama tam hassasiyetle yapılır, 2 ondalıkla gösterilir.
- Puanlanmamış gönderiye varsayılan değer verilmez. Kısmi oy pusulası geçerlidir.
- Geçerli puan almayan gönderi 0 sayılır. Gönderi yapmayan oyuncu o turdan 0 alır.
- Oylama açıkken canlı ortalama gösterilmez.
- Az oy alan gönderiye düzeltme uygulanmaz.
- Bir düelloda iki gönderi de 0 olursa sonuç beraberliktir (Bölüm 10).

### 8.3 Jüri ödülleri
- Final ekranında iki esprili ödül: **"En sert jüri"** (verdiği puanların ortalaması en düşük) ve **"En cömert jüri"** (en yüksek).
- Puan veren tüm katılımcılar (oyuncu ve seyirci) dahildir. Ödüle girmek için oyun boyunca en az 5 puan vermiş olmak gerekir.
- Eşitlikte ödül paylaşılır. Şartı sağlayan en az 2 kişi yoksa ödüller gösterilmez; aynı kişi iki ödülü birden alamaz.
- Ödül yalnız takma adı ve ortalamayı gösterir; kime kaç puan verildiğini göstermez.
- Uzatma turlarında verilen puanlar dahil edilmez.

---

## 9. Oyun Modları

### 9.1 Eleme
- En az 2 oyuncu. Tur sayısı aktif oyuncu sayısından otomatik hesaplanır.
- Her turda tüm aktif oyuncular aynı duruma gönderi yapar; sistem her tur yeni rastgele ikili eşleşmeler oluşturur. Eşleşmelerde yüksek puanlı gönderi tur atlar. Önceki tur puanları taşınmaz.
- **Bay:** Aktif oyuncu sayısı tekse bir oyuncu bay geçer ve doğrudan sonraki tura çıkar.
  - Bay geçen o tur gönderi yapmaz, tarafsız puanlayıcıdır.
  - Bay, o ana kadar en az bay geçmiş oyuncular arasından rastgele seçilir.
  - Tur başında "X bay geçti" gösterilir.
- Örnekler: 15 oyuncu → 7 eşleşme + 1 bay → 8; 14 → 7; 7 → 3 eşleşme + 1 bay → 4.
- Eşleşmeler tur başında herkese gösterilir; gönderiler yine anonim ve karışık sırada gösterilir, sonuçta düellolar yan yana açıklanır. (Hibrit yarı final ve finalde de aynı.)
- Elenen oyuncular seyirci olur (tek seferlik elenme geçişi gösterilir).
- Son iki oyuncunun düellosu finaldir.
- **Sıralama:** Final galibi 1., kaybeden 2. Diğerlerinde daha geç turda elenen önde; aynı turda elenenler o turdaki gönderi puanına göre sıralanır; eşitlikte sıra paylaşılır.

### 9.2 Lig
- En az 2 oyuncu. Yönetici 1–50 tur seçer, varsayılan 10.
- Kimse elenmez. Her turun gönderi puanı oyuncunun lig toplamına eklenir; gönderi yoksa 0 eklenir.
- Final tablosu sıralamayı belirler. Yalnız 1. sıra eşitliği çözülür; diğer eşitlikler paylaşılır.
- 2 oyunculu lig düello bağlamıdır (8.1).

### 9.3 Hibrit
- En az 4 oyuncu. Varsayılan mod. Toplam 11 tur.
1. **Lig aşaması:** 5 tur, tüm oyuncular (4 oyuncuda da 5 tur).
2. **İlk 4** yarı finale kalır; diğerleri seyirci olur (elenme geçişi gösterilir). 4./5. sınırındaki eşitlik çözülür; ilk 4 içindeki sıra eşitliği kura ile belirlenir.
3. **Yarı finaller (paralel):** 1.–4. ve 2.–3. eşleşmeleri aynı turlarda oynanır; 4 oyuncu aynı duruma gönderi yapar; 3 tur. Eşleşmedeki rakipler birbirini puanlayamaz, diğer eşleşmeyi puanlar.
4. **Final:** yarı final galipleri; 3 tur.
- **Maç sonucu:** 3 turun puan toplamı. Lig puanı maça taşınmaz; beraberlikte ilk ayırıcıdır.
- **Sıralama:** Final galibi 1., kaybeden 2. Yarı final kaybedenlerinden lig puanı yüksek olan 3., diğeri 4. (eşitlikte paylaşılır). 5. ve sonrası lig aşaması sırasına göre.
- **Oyuncu kaybı:**
  - İlk 4 belli olmadan aktif oyuncu 4'ün altına düşerse yarı finaller iptal edilir; lig tablosu final sonuçtur.
  - İlk 4 belli olduktan sonra ayrılan yarı finalistin rakibi hükmen finale çıkar.
  - Finalist ayrılırsa diğeri hükmen şampiyon olur.

---

## 10. Beraberlik

### 10.1 Hangi beraberlikler çözülür

| Beraberlik | İşlem |
|---|---|
| Eleme eşleşmesi | Çözülür |
| Hibrit maç (yarı final, final) | Çözülür |
| Hibrit ilk 4 sınırı (çok kişili olabilir) | Çözülür |
| Lig modunda 1. sıra | Çözülür |
| Hibrit ilk 4 içindeki sıralama | Kura |
| Diğer tüm sıralar | Paylaşılır ("Ortak 2.") |

### 10.2 Çözüm zinciri
1. **Hesapla ayırma** (yalnız hibrit maç): 3 turluk toplamlar eşitse lig aşaması toplamı yüksek olan kazanır.
2. **Uzatma turu** (en fazla 1 kez): Yeni durum, 30 sn seçim süresi; yalnız berabere kalanlar gönderi yapar, diğer herkes puanlar. Puanlama kuralları Bölüm 8 ile aynıdır. Çok kişili beraberlikte hepsi aynı turda yarışır ve tur sonucu onları sıralar.
3. **Kura:** Uzatma de berabere biterse ekranda animasyonlu kura ile belirlenir. Yönetici karar vermez.
- Aynı turda birden fazla beraberlik varsa hepsi **tek bir uzatma turunda** birlikte çözülür.
- Uzatma puanları yalnız beraberliği çözer; hiçbir toplama veya ödüle eklenmez.

---

## 11. Katılımcı Yönetimi

### 11.1 Yönetici eylemleri

| Eylem | Kime | Sonuç |
|---|---|---|
| Seyirciye al | Oyuncu | Odada kalır, puanlamaya devam eder, artık yarışmaz. |
| Odadan at | Oyuncu / seyirci | Çıkarılır; aynı tarayıcıyla geri giremez. O turdaki kilitlenmemiş oyları silinir. |
| Takma adı sıfırla | Oyuncu / seyirci | Geçici ada ("Katılımcı 7") döner, yeni ad seçmesi istenir. Rol ve puanlar korunur. |

Oyuncu kendi isteğiyle de menüden **"Oyunu bırak, seyirci ol"** seçebilir; sonucu "Seyirciye al" ile aynıdır.

### 11.2 Oyuncu ayrılınca
- Geçmiş turlar ve verdiği oylar değişmez (atılma hariç: o turun kilitlenmemiş oyları silinir).
- O turun kilitlenmemiş gönderisi geçersiz olur.
- Gelecek turlara ve sıralamaya dahil edilmez.
- **Eleme/hibrit:** Turun eşleşmeleri belirlenmeden ayrılırsa kalanlar yeniden eşleştirilir; belirlendikten sonra ayrılırsa rakip hükmen kazanır. Hibrite özel kurallar 9.3'te.
- Her ayrılma oturum denetim kaydına yazılır.

---

## 12. Kendi Kendine Akan Oyun, Duraklatma ve Hatalar

### 12.1 Yöneticisiz akış
- Oyun başladıktan sonra hiçbir an yönetici müdahalesi beklenmez.
- Yönetici bağlantısı koparsa oyun durmaz, katılımcılara bir şey gösterilmez; yönetici geri dönünce konsol güncel durumla açılır.
- Duruma bağlı yönetici onayları (cihaz devri, açıksa oyuncu/seyirci onayları) oyunu bekletmez.

### 12.2 Duraklatma
- Yönetici oyunu istediği an duraklatıp devam ettirebilir; süre sınırı yoktur.
- Duraklatmada tüm katılımcı eylemleri (seçim, oy) dondurulur.
- Devam edilince o anki gönderi gösterimi baştan başlar; seçim, final gözden geçirme ve sonuç aşamaları kalan süreden devam eder.

### 12.3 Medya hatası
- Medya seçim sırasında doğrulanır ve önizlenir.
- Gösterimde yükleyemeyen cihaz bir kez daha dener, olmazsa "Bu cihazda yüklenemedi" gösterir; göremeyen final gözden geçirmede yeniden deneyebilir.
- Oyun durmaz; yöneticiye ayrı bir hata çözme akışı yoktur. Hiç puan gelmezse gönderi 0 alır.
- Hatalar platform admin raporuna yazılır.

### 12.4 Sunucu yeniden başlarsa
- Kritik aşama durumu ve kilitli oylar kalıcı olarak saklanır.
- Bağlantılar geri gelince "Devam ediyoruz… 3-2-1" gösterilir; yönetici onayı beklenmez.
- Seçim, final gözden geçirme ve sonuç kalan süreden devam eder; gönderi gösterimi o gönderinin başından başlar.

### 12.5 İçerik gizleme
- Gösterim sırasında yönetici her içeriği (sistem meme'leri dahil) **"Hemen gizle"** düğmesini 1 saniye basılı tutarak tüm ekranlardan anında kaldırabilir (kazara basmayı önlemek için). Eylem denetim kaydına ve admin raporuna yazılır.
- **Özel içerik gizlenirse:** gönderi geçersiz, oyuncu o turdan 0 alır.
- **Sistem meme'i gizlenirse:** oyuncu cezalandırılmaz.
  - Lig, hibrit lig aşaması ve hibrit maçlarda o tur için aynı aşamadaki diğer turlarının ortalamasını alır (aşama sonunda hesaplanır; aşamada başka turu yoksa 0).
  - Eleme düellosunda rakibiyle uzatma turuna gider.

---

## 13. Ortak Ekran ve Ses

### 13.1 Ortak ekran
- Telefonlar her durumda gönderiyi ve puanlamayı gösterir; ortak ekran ek bir yüzeydir.
- **Açma yolları:**
  1. Konsoldan "Ortak ekranı aç" ile aynı cihazda yeni sekme.
  2. Başka cihazda `/ekran` sayfasında eşleştirme kodu girme. Kod, yönetici konsolda "Ekran eşleştir"e basınca üretilir; 6 haneli rakamdır, tek kullanımlıktır, 5 dakika geçerlidir.
- Aynı anda tek ortak ekran vardır; yeni eşleşen ekran eskisini düşürür.
- Ekran bağlantısı gizli anahtarla korunur, yalnız izler.
- Gösterdikleri: lobi (QR, oda kodu, katılımcılar), durum ve seçim geri sayımı, anonim gönderiler, final gözden geçirme bekleme ekranı, uzatma ve kura, sonuçlar ve tablo, duraklatma, final kürsüsü, şampiyon ve jüri ödülleri.
- Oyun boyunca köşede küçük QR ve oda kodu ile seyirci sayısı görünür.
- Ortak ekran yoksa aynı sahne içeriği telefonlarda mobil düzende gösterilir.

### 13.2 Ses
- **Ortak ekran varsa:** ses yalnız ortak ekranda çalar; telefonlarda video sessiz oynar, kullanıcı isterse kendi cihazında açabilir.
- **Ortak ekran yoksa:** telefonlarda video sessiz başlar, belirgin bir "Sesi aç" düğmesi gösterilir; tercih oturum boyunca hatırlanır (tarayıcı izin verdiği sürece).
- Oyuncunun seçim sırasındaki kendi önizlemesi normal davranır (kullanıcı başlatır, ses açık).
- Ortak ekran açılışında büyük bir "Ekranı başlat" düğmesi tarayıcının ses kilidini açar ve tam ekrana geçirir.
- Oyun sessiz de tamamen anlaşılır olmalıdır.
- YouTube içerikleri gizlilik modlu `youtube-nocookie.com` üzerinden gösterilir.

---

## 14. Yönetici Konsolu

### 14.1 Lobi
- Oda kodu ve QR; **paylaşım:** katılım linkini kopyala, QR'ı görsel olarak indir/göster (masaya koymak, sosyal medyada paylaşmak, ekrana yansıtmak için).
- Ortak ekran açma/eşleştirme.
- Ayarlar ve tahmini süre (4.3).
- Oyuncu ve seyirci listeleri; onay kuyrukları (ilgili ayarlar açıksa).
- İlk turun durum önizlemesi ve değiştirme.
- Başlat (hak onayıyla) ve lobiyi iptal et.

### 14.2 Oyun sırasında
- Duraklat / devam et; seçime süre ekle; sonraki tur ayarlarını değiştir.
- Durum önizlemesi ve değiştirme (6.4).
- Özel içerik canlı listesi ve reddetme (7.1); "Hemen gizle" (12.5).
- Katılımcı eylemleri (11.1); cihaz devri onayları (5.5).
- Yeni seyirci kabulünü aç/kapat.
- Sonuç ekranında hemen geç / beklet.
- Oyunu erken bitir (onaylı).
- Oyun bitince rövanş.

### 14.3 Yönetici oyuncu olarak
- Yönetici odaya normal bir katılımcı olarak (QR/kod, başka cihaz veya ayrı sekme) girebilir; konsol kimliği ile katılımcı kimliği ayrıdır.
- Konsoldaki gönderen adları, durum önizlemesi ve içerik gizleme yetkisinin oynayan yöneticiye sağladığı avantaj MVP'de bilinerek kabul edilmiştir.

### 14.4 İşletme paneli (oyun dışı)
- Kalan hak, şifre değiştirme.
- "Durumlarım" kütüphanesi (6.2).
- Geçmiş oturumlar ve özetleri (mod, tarih, katılımcı sayıları, sonuç).

---

## 15. Platform Admin

### 15.1 İşletmeler
- Oluşturma, listeleme, detay, aktif/pasif yapma, şifre sıfırlama.
- İmtiyazlar (3.3): hak ekle/çıkar, sınırsız hak, eşzamanlı oturum sayısı, lobi ömrü.

### 15.2 Kriz araçları
- Herhangi bir aktif oturumu tek tuşla sonlandırma.
- Oturum detayında "bu oturumun hakkını iade et".
- **İşletme adına giriş:** Admin işletmenin konsolunu onun adına açıp canlı müdahale edebilir. Her giriş kayda geçer.

### 15.3 İçerik
- Meme kategorileri; sistem meme'leri: linkten ekle, dosya yükleme, toplu içe aktarma, etiketlenmemiş kuyruğu ve hızlı etiketleme, önizleme, kategori/açıklama düzenleme, video kesme, arşivleme.
- Platform durumları: oluşturma, düzenleme, arşivleme; az durum uyarısı.
- İşletme durumları: listeleme, filtreleme, detay, engelleme / engeli kaldırma.

### 15.4 Raporlar (sade)
- Canlı ve geçmiş oturum listesi, filtreler.
- Oturum detayı: işletme, zaman damgaları ve durum, mod ve ayarlar, katılımcı takma adları ve rolleri, oyuncu/seyirci sayıları, oynanan durumlar (sahiplik ve oynandığı andaki metin), kullanılan sistem meme'leri, özel içerik kullanımı (yalnız tür), geçerli oy sayıları ve ortalamalar, tur/maç sonuçları, final sıralaması, çıkarmalar, gizlenen içerikler, duraklatmalar, medya hataları, erken bitiş, admin müdahaleleri.
- İşletme bazında kullanım özeti.
- Sistem hata kayıtları.
- Grafikli analiz panelleri yoktur.

### 15.5 Platform ayarları
- Gösterim süreleri, dosya boyutu, varsayılanlar gibi platform sabitleri admin panelinde değil, sunucu ayarındadır.

---

## 16. Veri Saklama

- Özel dosyalar ve YouTube link ayrıntıları **oturum bitince silinir**. Raporlarda yalnız "özel içerik kullanıldı" ve tür (resim/GIF/YouTube) kalır.
- Takma adlar oturum bitiminden **7 gün** sonra "Katılımcı 1, 2…" olarak anonimleştirilir; skorlar, oylar ve istatistikler kalır.
- Sistem meme'leri ve durum referansları arşivlendikten sonra da çözümlenebilir kalır.
- Kilitlenmiş turlar normal işleyişte değiştirilemez.
- İşletme hesabı verileri hesap aktif olduğu sürece saklanır.
- Hukuki metinler (aydınlatma, gizlilik, kullanım koşulları) ve yasal saklama süreleri owner tarafından ayrıca ele alınacaktır; bu doküman hukuki değerlendirme içermez.

---

## 16A. Görsel Dil, Ton ve Hareket

### 16A.1 Görsel yön: "Gece Şovu"
- Oyun yüzeyleri (katılımcı telefonu, ortak ekran, yönetici konsolu) koyu sahne zemini üzerine tek parlak vurgu rengiyle tasarlanır; yarışma programı hissi.
- Başlangıç paleti (uygulamada anlamsal CSS değişkenleri olarak tanımlanır ve WCAG AA kontrastı doğrulanır): zemin `#121018`, yüzey `#1E1B26`, metin `#F5F2EA`, vurgu sarı `#FFD23F` (koyu metinle).
- Yazı tipleri: **Anton** (büyük harf başlıklar, rakamlar, süre) + **Manrope** (metin). Anton uzun metinde kullanılmaz.
- Meme'ler koyu çerçeve içinde gösterilir. Renk yalnız süre, durum, seçili puan ve önemli geri bildirimlerde yoğunlaşır.
- İşletme paneli aynı yönün sakin versiyonudur. Platform admin paneli nötr ve sadedir; esprili metin ve süs hareketi yoktur.
- Kaçınılacaklar: yoğun gradyanlar, varsayılan mor tonlar, aşırı yuvarlak kartlar, ağır gölgeler.

### 16A.2 Ton: "Esprili ve Asi"
- Mizah oyun, bekleme, boş ekran, geçiş, sonuç ve başarı anlarında serbesttir. Örnekler: "Şaka ciddileşti.", "Pişmanlık serbest.", "Oy ver, kaçma.", "Meme avı başladı. Panik opsiyonel.", "Taht sallandı. Jüri koltuğun hazır.", "Video naz yaptı." (ardından net açıklama), "Şaka tahta çıktı."
- Form etiketleri, kritik işlemler, geri alınamaz onaylar ve hata kurtarma talimatları her zaman net ve doğrudandır.
- Admin panelinde operasyonel dil kullanılır ("İşletme Oluştur", "Hak Ekle").

### 16A.3 Hareket
- Seçim onayı: kısa "pop" animasyonu.
- Son karar saniyeleri: yavaş nabız; hızlı yanıp sönme yok.
- Lobi / bekleme: ölçülü döngüsel ikon hareketi.
- Elenme ve rol değişimi: tek seferlik geçiş.
- Sırayla sonuç açıklama: kısa açılış animasyonları.
- Şampiyon: kısa konfeti ve kazanan işareti, ardından sabit sonuç ekranı.
- Hata: süs animasyonu yok; neden, etki ve çözüm gösterilir.
- `prefers-reduced-motion` için durağan karşılıklar.

---

## 17. Kapasite, Performans ve Tarayıcılar

- **Kapasite doğrulama hedefi (MVP):** Oturum başına toplam 100 eşzamanlı katılımcı (oyuncu + seyirci, herhangi bir dağılım) + yönetici cihazları + 1 ortak ekran. Ürün katılımcı sayısını bu hedefle sınırlamaz; 300 katılımcıyla da yerelde tamamlandığı ölçüldü (M7b), daha büyük gruplar MVP sonrası hedeftir.
- Normal koşullarda seçim/oy onayı kullanıcıya 1 sn içinde görünür.
- Bağlı istemciler arasında aşama farkı en fazla 1 sn.
- Tekrarlanan ve geç gelen komutlar idempotent işlenir veya reddedilir.
- Desteklenen tarayıcılar: güncel mobil Chrome ve Safari; güncel masaüstü Chrome, Edge ve Safari.
- Duyarlı tasarım doğrulama genişlikleri: 320, 768, 1024, 1440 px. Ortak ekran 16:9 projeksiyon için ölçeklenir.

---

## 18. Erişilebilirlik

- WCAG 2.1 AA.
- Normal metin kontrastı en az 4.5:1, büyük metin 3:1, arayüz bileşenleri 3:1.
- Dokunma hedefleri en az 44×44 px.
- Tam klavye kullanımı ve görünür odak.
- Mantıklı başlık sırası, sayfa başına tek ana başlık.
- Görünür form etiketleri ve alana bağlı hata mesajları.
- Durum değişiklikleri uygun canlı bölgelerle (live region) duyurulur.
- Renk tek başına durum göstergesi değildir.
- %200 metin büyütmede kullanılabilir.
- Saniyede 3'ten fazla yanıp sönme yoktur; `prefers-reduced-motion` desteklenir.
- Diyaloglarda odak tuzağı ve odak geri dönüşü.
- Oyun sessiz anlaşılır; altyazı varsa gösterilir.

---

## 19. Doğrulama Stratejisi

- **Oyun kuralları:** üç mod; 2'den büyük oyuncu sayılarında eşleşme ve bay; lig toplamları; hibrit eleme, yarı final, final, üçüncülük; düello puanlama kuralı ve istisnası; tüm beraberlik zincirleri (çok kişili, aynı turda çoklu); eksik gönderi ve sıfır puan; ayrılma, atılma, hükmen galibiyet; <2 oyuncuda bitiş; gizlenen sistem meme telafisi.
- **Hesap ve haklar:** işletme oluşturma, şifre değiştirme/sıfırlama, başlatmada hak düşmesi, 0 hakta lobi engeli, sınırsız hak, eşzamanlı oturum imtiyazı, hak iadesi, işletme adına giriş, pasife alma.
- **Gerçek zamanlı ve kurtarma:** yenileme ve yeniden bağlanma; yönetici onaylı cihaz devri; çoklu yönetici cihazı; ortak ekran kopması ve eşleştirme kodu; tekrarlı/geç komutlar; geç katılım kuralı; sunucu yeniden başlatma ve otomatik devam; senkron gönderi sırası; oy kilitleme ve gönderen açıklama; duraklatma.
- **Medya:** sistem resim/GIF/video; özel resim/GIF yükleme ve EXIF temizleme; YouTube doğrulama, kırpma, 25 sn sınırı, gömülemeyen video reddi; video dosyası reddi; yükleme hatası; cihaz bazlı yükleme hatası; gizleme; oturum sonunda silme; toplu içe aktarma ve dönüştürme.
- **İçerik:** işletme durumu doğrulama ve tekrar normalizasyonu, arşiv, admin engeli, canlı havuz çekimi, havuz bitince tekrar, durum değiştirme ve önizleme.
- **Yük, erişilebilirlik ve arayüz:** 100 katılımcı yükü; oyuncu, seyirci, yönetici, admin ve ortak ekran yolculukları; klavye; ekran okuyucu duyuruları; otomatik erişilebilirlik kontrolleri; azaltılmış hareket; duyarlı düzenler; yükleniyor/boş/hata/çevrimdışı/kurtarma durumları.

---

## 20. Kapsam Dışı ve Sonraki Aşamalar

### 20.1 MVP'de olmayanlar
- İşletme kendi kaydı, ödeme, abonelik, fatura.
- İşletme başına birden fazla personel hesabı.
- Kalıcı katılımcı hesapları, herkese açık odalar, eşleştirme, arkadaşlar, sosyal akış.
- İşletme markalaması / beyaz etiket.
- İçerik paketleri, yaş etiketleri, güvenli mod filtreleri.
- Güçlü katılımcı kimlik doğrulaması veya cihaz parmak izi.
- Video dosyası yükleme (oyuncu tarafında).
- Deneme modu.

### 20.2 MVP sonrasına ertelenenler
- TikTok, Instagram, X içerik desteği.
- Oynayan yönetici için konsolda gönderen adının ve durum önizlemesinin gizlenmesi.
- Özel içerik için ara seviyeler (ör. yönetici ön onaylı mod).
- Otomatik uygunsuz görsel tespiti.
- Yapay zekâ ile kütüphane etiket önerisi.
- Çok dil desteği.
- Admin girişinde iki aşamalı doğrulama.

### 20.3 Sonraki tasarım aşamaları
- **Ekranlar ve kullanıcı akışları:** tamamlandı; kararlar `docs/PROJECT_LOG.md` Bölüm 3'te, taslaklar orada bağlantılı.
- **Teknoloji ve mimari:** framework, gerçek zamanlı iletişim, veritabanı, depolama (Cloudflare R2), medya dönüştürme, kimlik/oturum yönetimi, barındırma, gözlemlenebilirlik, CI/CD, eşzamanlı oturum hedefi, alan adı.
- **Yayın öncesi içerik (owner):** ilk platform durumları seti (~100+), meme kütüphanesi ve kategoriler.
