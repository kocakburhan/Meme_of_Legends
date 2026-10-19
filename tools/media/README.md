# Yerel medya aracı

Node.js ≥22 ve pnpm ile, depo kökünde tek adımlık sudo'suz kurulum:

```sh
pnpm install && pnpm media setup
```

ffmpeg/ffprobe önce PATH'ten, yoksa npm ile gelen platforma uygun statik
paketlerden çalıştırılır. pnpm'in atladığı çalıştırma izinleri araç tarafından
verilir; `approve-builds` gerekmez. yt-dlp, resmi tek dosya sürümünden SHA-256
kontrolüyle kullanıcı önbelleğine indirilir. Linux x64/arm64, macOS ve Windows
hedeflenir; bu işte Linux x64 doğrulandı. İkili yolları `MOL_FFMPEG`,
`MOL_FFPROBE`, `MOL_YTDLP` ile değiştirilebilir. yt-dlp için güncel Node.js
JavaScript çalışma zamanı etkinleştirilir.

```sh
pnpm media update                 # yt-dlp -U
pnpm media login                  # kullanıcı adı + görünmeyen şifre girişi
pnpm media login --server http://localhost:8787
pnpm media add 'https://youtu.be/jNQXAC9IVRw' --category Komik --description 'İlk gün'
pnpm media add ./video.mov --start 0:05 --end 0:20
pnpm media add ./resim.png --dry-run
pnpm media import ./links.txt --category Komik --report ./rapor.json
pnpm media import ./arsiv --dry-run
```

Sunucu: `--server` → `MOL_MEDIA_SERVER` → kayıtlı adres →
`http://localhost:8787`. `MOL_ADMIN_USERNAME` ve `MOL_ADMIN_PASSWORD` ile
etkileşimsiz giriş de yapılabilir; add/import komutlarında ikisi birlikte
verilirse o işlem için oturum açılır. Şifre kaydedilmez. Oturum çerezi ve
sunucu adresi `MOL_MEDIA_CONFIG_DIR` veya kullanıcı yapılandırma dizinindeki
`mol-media/session.json` içinde tutulur (Unix dizin 0700, dosya 0600).
Çerez yalnız kayıtlı sunucuya gönderilir. Windows'ta kullanıcı klasörünün
ACL izinleri geçerlidir. Oturumu yerelden silmek için bu dosyayı silin.

Kategori adı sunucudaki etkin kategorilere Türkçe büyük/küçük harf duyarsız
eşlenir; bulunamazsa mevcut adlar gösterilir. Kategori ve açıklama birlikte
verilmezse içerik sunucuda etiketlenmemiş kuyruğuna girer.

`links.txt`: her satırda bir bağlantı, boş satırlar ve `#` yorumları atlanır.
Klasör içe aktarma alt klasörlere inmez; jpg/jpeg/png/webp/gif ve
mp4/mov/mkv/webm/avi/m4v dosyalarını işler. İki iş eşzamanlı yürür; birinin
hatası diğerlerini durdurmaz. Rapor her kaynak için `source`, `result`, varsa
`memeId` veya `error` içerir. Sonuçlar `uploaded`, `duplicate`, `dry-run`,
`error`; özet ve oluşturma tarihi de JSON'a yazılır. Rapor varsayılan olarak
çalışılan dizine `mol-media-report-<zaman>.json` adıyla yazılır; mevcut raporun
üzerine yazılmaz. Herhangi bir öğe hatalıysa çıkış kodu 1'dir.

YouTube/X/Instagram linkleri kanonikleştirilir; takip parametreleri ve video
başlangıç/oynatma listesi parametreleri atılır. Kesim için komut seçeneklerini
kullanın. Birden fazla medyalı gönderilerde **ilk öğe** seçilir. Platformun
indirmeye kapattığı, giriş gerektiren veya yt-dlp'nin desteklemediği gönderi
biçimleri Türkçe hata ile raporlanır; tarayıcı oturumu/cookie aktarımı bu
sürümde yoktur. Fotoğraf galerileri yt-dlp desteğine bağlıdır; yerel resim
dosyasıyla ekleme her zaman kullanılabilir.

Normal yüklemede indirmeden önce sunucuda mükerrer kontrolü yapılır;
yükleme sırasında oluşabilecek 409 da mükerrer olarak raporlanır.
`--dry-run` indirme ve dönüştürmeyi yapar, oturum ve sunucu gerektirmez;
mükerrer kontrolü/yükleme yapmaz (kategori verilirse listeyi sunucudan alır).
Tüm geçici dosyalar işlem sonunda, hata durumunda da temizlenir.

Video MP4 H.264/yuv420p + varsa AAC, CRF 23, faststart ve uzun kenar ≤720 px
olarak üretilir; ses yoksa sessiz kalır. JPEG kapak çıkarılır, süre çıktıdan
ffprobe ile ölçülür. İndirmede H.264/AAC tercih edilir; ara birleştirme MKV'dir.
25 sn üstü video açık kesim olmadan reddedilir. `--start` tek başına kalan
kısmı, `--end` tek başına başlangıçtan o ana kadarını seçer; sonuç ≤25 sn
olmalı. Resimler JPEG'e dönüştürülür (saydamlık korunmaz), GIF animasyon
olarak kalır; uzun kenar ≤1280 px, meta veriler temizlenir.

## Doğrulama

```sh
pnpm --filter @mol/media test
pnpm verify
```

Birim ve sahte HTTP sunucusu testleri; kanonikleştirme, komutlar, hatalar,
iki iş sınırı, JSON raporu, kategori, giriş ve multipart 201/409/422
sözleşmesini doğrular. Ağsız dönüştürme testleri kısa video, sessiz uzun video,
PNG/JPEG/WebP ve GIF üretir; codec/piksel biçimi, süre, boyut, kapak,
animasyon ve faststart denetlenir. Yaklaşık 1–2 sn sürer, verify'a dahildir.

2026-10-19 gerçek indirme denemeleri (yüklemesiz):

- `https://www.youtube.com/watch?v=jNQXAC9IVRw`: `--dry-run` başarılı;
  indirme ve dönüştürme tamamlandı. İlk denemede AV1/Opus'un eski statik
  ffmpeg ile MP4'e birleştirilmesi başarısızdı; H.264 tercihi ve MKV ara
  biçimiyle düzeltildi, tekrar denendi.
- `https://x.com/NASA/status/1760811461943722132`: `--start 0 --end 5 --dry-run`
  başarılı; indirildi, kesildi, dönüştürüldü.
- `https://www.youtube.com/watch?v=BaW_jenozKc`: platform içerik erişilemez
  yanıtı verdi, yüklenmedi.

API entegrasyonu görevde sabitlenen sözleşmeye göre sahte sunucuyla
sınandı; gerçek admin API/R2 yüklemesi ve fiziksel iOS Safari testi yapılmadı.
