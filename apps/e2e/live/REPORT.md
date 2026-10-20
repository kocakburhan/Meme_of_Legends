# Canlı medya duman testi — 20 Ekim 2026

**Kök neden: ekran görüntüsü medya yüklenmeden alınıyordu.** Önceki test yalnız `Gönderi 1 / 3` yazısını bekleyip `presentation.png` alıyordu; Bearer fetch → blob → resim decode veya YouTube iframe yüklemesini beklemiyordu. Daha sonra herhangi bir PNG'nin görünmesini beklemesi, ilk karenin hazır olduğunu kanıtlamıyordu. Aynı boşluk yeni koşuda PNG gönderisinin `display-initial.png` karesinde yeniden üretildi; 2,5 saniye sonraki karede resim göründü. Kalıcı bir medya alanı/yükleme arızası gözlenmedi. Eski PNG tek başına hangi gönderinin gösterildiğini belirtmediğinden geçmiş karenin türü kesin belirlenemez.

Test artık üç gönderinin **her biri** için ortak ekranın ilk karesini, 2,5 saniye sonraki karesini ve Duman oyuncusunun 390×844 telefon görüntüsünü alıyor. `presentation-evidence.json` slotu, türü (`upload PNG` / `youtube`), telefon slotunu, resim decode bilgisini, iframe `src` adresini ve alan boyutlarını kaydediyor. `media-network.json` medya isteklerinin zamanını, durumunu, içerik türünü ve Bearer kullanılıp kullanılmadığını içeriyor; kimlik başlıklarının değerleri/çerezler kaydedilmiyor. Trace kapalı. Bunlar tanılama kayıtlarıdır; 2,5 saniyelik örnekleme YouTube oynatımının tamamlandığını garanti etmez.

Kütüphanede aktif içerik yoksa adım **SKIP**; alternatif PNG ile oyun sürüyor. Kategori veya sistem meme'i oluşturulmuyor. YouTube doğrulama başarısızlığı hâlâ soft assertion hatasıdır.

| Kontrol                  | Kanıt / sonuç                                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PNG ortak ekran          | Her iki dosya isteği **200**, `image/png`, **Bearer=true**; ardından iki PNG `blob:` adresinde, `complete=true`, doğal boyut 24×24; resim alanı yaklaşık 746×419 px. İlk boş kareden sonra resimler görünüyor. |
| PNG telefon              | `/api/rooms/…/custom/uploads/…` adresiyle gerçek resim; kendi gönderisinde “Kendi gönderini puanlayamazsın.” mesajı beklenen davranış.                                                                         |
| YouTube                  | Doğrulama + kırpma geçti. İki yüzeyde `youtube-nocookie.com/embed/jNQXAC9IVRw` iframe'i oluşuyor. Ortak ekranda video karesi görünüyor; codec hatası kanıtı yok.                                               |
| Tarayıcı karşılaştırması | Paket Chromium 156.0.8078.4 ve `channel: 'chrome'` 155.0.8059.40 ile oyun tamamlandı. Sistemde `/opt/google/chrome/chrome`, Brave'e symlink; ikinci koşu Google Chrome olarak yorumlanmamalı.                  |
| Oyun sonu                | Puanlama → gözden geçirme → sonuç → şampiyon geçti; özel PNG adresi oyun sonunda 404.                                                                                                                          |

Kanıt dizinleri bu rapora göre `artifacts/` altında (Git tarafından dışlanır):

- İlk Chromium koşusu: `smoke-özel-içerik-yükleme--befc2-m-YouTube-gösterim-ve-silme/`; sıra YouTube, PNG, PNG.
- Sistem tarayıcısı: `chrome/smoke-özel-içerik-yükleme--befc2-m-YouTube-gösterim-ve-silme/`; sıra YouTube, PNG, PNG.
- Kalıcı ağ/DOM JSON kayıtlarını içeren son Chromium koşusu: `chromium/smoke-özel-içerik-yükleme--befc2-m-YouTube-gösterim-ve-silme/`; sıra PNG, YouTube, PNG.
- Her dizinde `presentation-{1,2,3}-display-initial.png`, `presentation-{1,2,3}-display.png`, `presentation-{1,2,3}-phone.png`.

Çalıştırma (`MOL_ADMIN_PASSWORD` ortam değişkeni gerekir):

```sh
pnpm --filter @mol/e2e exec playwright test -c live/playwright.config.ts
MOL_BROWSER_CHANNEL=chrome pnpm --filter @mol/e2e exec playwright test -c live/playwright.config.ts
pnpm --filter @mol/e2e exec tsc -p live/tsconfig.json
pnpm verify
```

Yalnız `apps/e2e/live/` değiştirildi. Uygulama/sunucu kodu değişmedi; deploy yapılmadı, doğrudan wrangler komutu çalıştırılmadı. Zorunlu `pnpm verify`, mevcut build betiği üzerinden Wrangler `deploy --dry-run` çalıştırıyor; bu yalnız yerel derleme yaptı. Aktif kütüphane içeriğiyle seçim, içerik olmadığı için sınanamadı; YouTube videosunun klip boyunca kesintisiz ilerlemesi ayrıca ölçülmedi.

Doğrulama: üç canlı koşu geçti (Chromium 1,4 dk; sistem tarayıcısı 1,4 dk; JSON kanıtlı Chromium 1,6 dk). Canlı TypeScript kontrolü ve `pnpm verify` geçti: typecheck, lint, **426 test**, build; çıkış kodu 0. Wrangler'ın yerel log dizinine yazarken verdiği EROFS mesajı doğrulamayı başarısız yapmadı.

Bu çalışmada oluşturulan üç işletme pasife alındı:

- `5aa9ad62-d9b5-4d25-b81d-b00a86b26cab`
- `ea7c4d37-492c-43dd-951a-4cfcc3e640c6`
- `dd099991-7294-4460-8d10-359cc63f9cce`

Önceki rapordaki dört işletmenin pasife alınmış olduğu kaydı korunur: `e638ba3f-278f-4c7b-b557-aa089e1f8eb4`, `70d1a70e-8501-4e01-acdf-99c4299946c1`, `1aecb8f2-28ae-4c47-914d-0189d4d250a9`, `3840a1fd-37f2-4c66-9775-28b6a831097e`. Yeni sistem meme'i/kategori oluşturulmadığı için arşivlenecek içerik yok.

Commit denendi; `git add` ortak Git dizininde `/home/kocak/Projects/Meme_of_Legends/.git/worktrees/mol-wt-m7d/index.lock` oluşturamadı (`Read-only file system`). Commit/push oluşmadı; değişiklikler çalışma ağacında bırakıldı.
