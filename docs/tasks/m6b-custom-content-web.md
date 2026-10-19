# Görev: M6b — Özel içerik (web)

Worker: OpenCode (deepseek-v4.1-flash, max) · Dal: `m6b-custom-web`

## Oku
AGENTS.md · **docs/contracts/custom-content.md** · docs/contracts/protocol.md · `packages/shared/src/index.ts` (custom şemaları, `mediaRefSchema`) · docs/PRODUCT_SPEC.md Bölüm 7.1, 7.2, 7.3, 12.3, 12.5, 14.2, 16A · apps/web/src/screens/SelectionScreen.tsx (Yükle/YouTube iskeleti), components/MemeFrame.tsx, screens/PresentationScreen.tsx, ReviewScreen.tsx, pages/EkranPage.tsx, console/GameTab.tsx

## Amaç
Oyuncunun seçim aşamasında kendi resim/GIF'ini yükleyip YouTube klibi seçebilmesi, bunların her ekranda doğru oynaması ve yöneticinin canlı listeden reddedebilmesi.

## Kapsam
1. **Yükle sekmesi:** dosya seç (telefonda galeri/kamera), JPG/PNG/WebP/GIF, ≤10 MB istemcide ön kontrol; yükleme ilerlemesi; önizleme (`previewUrl`); seçim + onay mevcut akışla (`select` → `{ source: 'upload', uploadId, mediaType }`). Sunucu hata kodları Türkçe (sözleşmedeki tablo). Video dosyası seçilirse "Video yüklenemez; YouTube linki kullan".
2. **YouTube sekmesi:** link yapıştır → doğrulama ucu → hata kodları Türkçe (gömülemez, özel/silinmiş, geçersiz link, YouTube'a ulaşılamadı). Gizlilik modlu oynatıcı (`youtube-nocookie.com`, IFrame Player API); süre oynatıcıdan okunur. **Dokunmatik zaman çizelgesi:** başlangıç/bitiş tutamaçları, en fazla 25 sn (aşarsa diğer tutamaç sürüklenir ya da sınırlanır), seçili aralığı önizle, düzelt, onayla → `{ source: 'youtube', videoId, startMs, endMs }`. Klavye ile de ayarlanabilir (ok tuşları).
3. **Oynatma (tüm yüzeyler):** gösterim, final gözden geçirme, ortak ekran, konsol: `upload` → `<img>` (sözleşmedeki erişim yöntemi; ortak ekran gerekiyorsa Bearer + blob URL), `youtube` → nocookie oynatıcı, `startMs`'ten başlar, `endMs`'te durur, bir kez oynar (SPEC 7.2). Video gösterim slotu süresi motordan gelir; oynatıcı aşama zamanlamasını bozmaz. Sesi kısık başlatma politikası: telefonlarda otomatik oynatma kısıtlarına uy (gerekirse "Sesi aç" düğmesi), ortak ekranda mümkünse sesli.
4. **Yüklenemezse:** `MemeFrame`'deki "bir kez dene → Bu cihazda yüklenemedi" davranışı özel içerikte de geçerli; yüklenemediğinde sözleşmedeki hata bildirimi ucu bir kez çağrılır.
5. **Konsol canlı listesi (SPEC 7.1, 14.2):** seçim kartında özel içerik gönderenler gönderen adıyla, küçük önizlemeyle; **Reddet** (onaylı, `rejectCustom`). Oyuncu tarafında "Bu içerik kabul edilmedi" bildirimi ve süre varsa yeniden seçim. Ayar kapalıysa sekmeler görünmez/pasif ve nedeni yazılı.
6. **E2E:** özel içerik açık bir lig oyunu: bir oyuncu PNG yükler (test içinde üretilen dosya), biri YouTube seçer — e2e'de YouTube ağına bağımlı olma: doğrulama ucunu ve IFrame API'yi Playwright `route` ile sahtele; yönetici bir yüklemeyi reddeder, oyuncu yeniden seçer; gösterimde içerik diğer oyunculara ve ortak ekrana görünür; oyun bitince özel dosya adresi artık erişilemez (404/403). Mevcut e2e'ler geçmeye devam eder.

## Kapsam dışı
Sunucu/motor/shared değişikliği (gerekirse dur ve özette yaz). Uzak Cloudflare. `docs/`. Erişilebilirlik genel düzeltmeleri başka worker'da (M7c); senin yazdığın yeni bileşenler ise baştan erişilebilir olsun (etiketler, odak, 44 px hedefler, canlı bölge).

## Bitti tanımı
- `pnpm verify` ve tüm e2e geçer. **Portlar:** e2e ve yerel sunucuları her zaman `MOL_SERVER_PORT=8807 MOL_WEB_PORT=5193` ile çalıştır (diğer portlar başka worker'larda).
- 390×844 ve 1280×800'de düzen bozulmaz.
- Dalda mantıklı commit'ler; push yok; depo köküne dosya bırakma; arkada süreç bırakma; asla çözülmeyen beklemeler yok.

## Parçalar
- **M6b-1:** madde 1, 2 (seçim ekranı: Yükle + YouTube kırpma) + bunların birim testleri.
- **M6b-2:** madde 3, 4, 5, 6 (oynatma, hata bildirimi, konsol listesi, tam e2e).

## Teslim
Kısa, doğru özet (uydurma yok), açık sorular.
