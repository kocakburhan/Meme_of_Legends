# Görev: M5b — Yerel medya aracı (`tools/media`)

Worker: Codex (gpt-6.1-sol, low) · Dal: `m5b-media-tool`

## Oku
AGENTS.md · docs/PRODUCT_SPEC.md Bölüm 6.1, 17 (tarayıcılar) · docs/PROJECT_LOG.md son girdiler (M5 medya kararı) · docs/tasks/m5a-admin-api.md madde 8 (yükleme ucu — paralel yazılıyor) · tools/loadtest (CLI paket örneği)

## Amaç
Owner'ın kendi bilgisayarında çalışan bir komut satırı aracıyla X/Instagram/YouTube linklerinden ve dosyalardan sistem meme'i eklemek: indir, dönüştür, kapak çıkar, gerekirse kes, admin API'siyle yükle.

## Kapsam
- `tools/media` altında TypeScript/Node CLI paketi (`@mol/media`), kökten `pnpm media <komut>` ile çalışır.
- **Kurulum sudo gerektirmemeli.** ffmpeg/ffprobe ve yt-dlp için sudo'suz bir yol seç (ör. npm statik ffmpeg paketleri, yt-dlp tek dosya sürümünün kullanıcı önbelleğine indirilmesi ve `yt-dlp -U` ile güncellenebilmesi). Sistemde kuruluysa onları kullanabilir. README'de tek adımlık kurulum.
- Komutlar (adlar önerdir):
  - `add <link|dosya> [--category <ad>] [--description "<metin>"] [--start 0:05 --end 0:20]` — tek içerik. Kategori adı sunucudaki kategori listesinden eşlenir (bulunamazsa net hata ve mevcut adlar).
  - `import <links.txt | klasör> [--category <ad>]` — toplu; açıklamasız olanlar etiketlenmemiş kuyruğuna düşer. 2 eşzamanlı iş; sonunda konsol özeti + JSON rapor dosyası (her öğe: kaynak, sonuç, meme id veya hata nedeni).
  - `login` / ayar: sunucu adresi (`--server`, varsayılan `http://localhost:8787`; canlı adres sonradan verilecek), admin kullanıcı adı/şifre (ortam değişkeni ya da etkileşimli). Şifre diske düz metin yazılmaz; oturum çerezi kullanıcı yapılandırma klasöründe saklanabilir.
- **Dönüştürme (tüm hedef tarayıcılarda oynamalı, iOS Safari dahil):**
  - Video → MP4, H.264 (yuv420p), AAC, `+faststart`, uzun kenar ≤ 720 px, makul CRF; ses yoksa sessiz. Kapak: JPEG/WebP kare. `durationMs` ffprobe'dan.
  - 25 sn'den uzun video, `--start/--end` verilmeden yüklenmez; toplu işte "kesim gerekli (süre: N sn)" olarak raporlanır.
  - Resim (jpeg/png/webp) → uzun kenar ≤ 1280 px; GIF gif olarak kalır (çok büyükse küçült). Biçim/medya tipi doğru belirlenir.
- **İndirme hataları** Türkçe ve net: silinmiş, gizli, giriş gerektiren, desteklenmeyen site, ağ hatası. Birden çok medyalı gönderilerde (ör. Instagram galeri) ilk öğe ya da hepsi — seçimini README'ye yaz.
- **Mükerrer:** indirmeden önce `GET /api/admin/memes/check?sourceUrl=` ile kontrol; varsa atla ve raporla. Linkler kanonik biçime getirilir (izleme parametreleri atılır) ki aynı içerik iki kez girmesin.
- **Yükleme biçimi (sabit, M5a'da yazılıyor):** `POST /api/admin/memes`, `multipart/form-data`: `file`, isteğe bağlı `cover`, `meta` JSON `{ mediaType, durationMs?, sourceUrl?, categoryId?, description? }`. Yanıtlar: `201 { meme }`, `409 MEME_DUPLICATE { existingId }`, `422 MEDIA_INVALID`. Kategoriler `GET /api/admin/categories`. Giriş `POST /api/auth/admin/login` `{ username, password }` (mevcut). Sunucu tarafı henüz yokken bu sözleşmeye göre sahte sunucuyla test et.
- Geçici dosyalar iş bitince silinir.

## Kapsam dışı
`apps/server`, `apps/web`, `packages/*` değişikliği (M5a başka worker'da). `docs/` değişikliği. Uzak Cloudflare işlemleri.

## Bitti tanımı
- Birim testleri: link kanonikleştirme, komut ayrıştırma, rapor, hata sınıflandırma, sahte sunucuya yükleme.
- Dönüştürme testi: ffmpeg ile üretilen kısa test videosu/resim/GIF dönüştürülür; çıktı codec/pix_fmt/süre/boyut doğrulanır (ağ gerekmez).
- Elle doğrulama: en az bir gerçek YouTube linki ve bir X linki indirilip dönüştürülür (yüklemesiz `--dry-run` yeterli); sonucu özette yaz. Başarısızsa nedenini yaz.
- `pnpm verify` geçer (yavaş dönüştürme testi verify süresini çok uzatıyorsa ayrı komuta al ve README'de belirt).
- Commit at; push yok. Arkada süreç bırakma.

## Teslim
Kısa özet: kurulum adımı, komutlar, elle denenen linkler ve sonuçları, açık sorular.
