# M7d canlı smoke raporu — 20 Ekim 2026

Sonuç: **tam geçmedi**. Gerçek Chromium/Playwright ile canlı ortamda oyun tamamlandı; iki kapsam maddesi başarısız/engelli kaldı. Uygulama kodu, Cloudflare kaynakları ve deployment değiştirilmedi.

| Adım                                                                        | Sonuç                                                                                         |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Admin giriş → genel bakış → işletme oluştur → giriş bilgileri → adına giriş | Geçti                                                                                         |
| İşletme kullanıcı adı/şifresiyle giriş → Yeni oyun → konsol                 | Geçti                                                                                         |
| Lig, 1 tur, özel içerik açık                                                | Geçti                                                                                         |
| `/ekran` kodla eşleştirme ve ekranı başlatma                                | Geçti                                                                                         |
| Ayrı bağlamlarda 390×844 boyutunda 3 oyuncu + 1 seyirci                     | Geçti                                                                                         |
| Kütüphaneden seçim                                                          | Engelli: aktif meme ve kategori yok                                                           |
| PNG yükleme → yönetici reddi → yeniden seçim                                | Geçti                                                                                         |
| Gerçek YouTube doğrulama ve kırpma                                          | Kaldı: doğrulama “YouTube'a ulaşılamadı; biraz sonra tekrar dene.” döndürdü; kırpma açılamadı |
| Gösterim → dört katılımcıyla puanlama → gözden geçirme → sonuç → şampiyon   | PNG alternatifleriyle geçti                                                                   |
| Oyun bitince yüklenen özel PNG adresine erişim                              | Geçti: aynı oyuncunun tarayıcısından `cache: no-store` isteği **404**                         |
| Temizlik                                                                    | Geçti: oluşturulan dört test işletmesi pasife alındı; sistem meme'i/kategori oluşturulmadı    |

YouTube hatasının istemci metni `YOUTUBE_UNAVAILABLE` karşılığıdır. Sunucu kodunda bu hata oEmbed isteği başarısız olduğunda üretiliyor; canlıdaki dış servis yanıtının ayrıntısı bu testle belirlenemedi. Oynatıcı, kırpma ve YouTube gösterimi doğrulanamadı. Ağ/oynatıcı ikamesi kullanılmadı. Denenen gerçek video: `https://youtu.be/jNQXAC9IVRw`.

Aktif kategori bulunmadığından, izin kapsamını genişletip kategori oluşturulmadı. Bu konu kullanıcıya soruldu; yanıt olmadan uygulanmadı. Kütüphane yerine PNG seçimi yalnız kalan akışın bağımsız doğrulanması için kullanıldı; kütüphane kontrolü başarısız olarak tutuldu.

Temizlenen işletme kimlikleri:

- `e638ba3f-278f-4c7b-b557-aa089e1f8eb4`
- `70d1a70e-8501-4e01-acdf-99c4299946c1`
- `1aecb8f2-28ae-4c47-914d-0189d4d250a9`
- `3840a1fd-37f2-4c66-9775-28b6a831097e` (tamamlanan oyunun işletmesi)

İlk denemelerde testin yinelenen konsol alanları için seçicileri daraltıldı; uygulama değiştirilmedi. Son koşu 1,8 dakika sürdü, beklenen iki soft assertion nedeniyle başarısız çıktı.

Kanıtlar, bu dosyaya göre `artifacts/smoke-özel-içerik-yükleme--befc2-m-YouTube-gösterim-ve-silme/` altında:

- `01-admin.png`: genel bakış
- `02-console.png`: lig ayarları
- `03-lobby.png`: ortak ekran ve 3 oyuncu + 1 seyirci
- `04-youtube-failed.png`: gerçek YouTube doğrulama hatası
- `presentation.png`: gönderi gösterimi
- `05-finished.png`: şampiyon ekranı
- `error-context.md`: Playwright hata bağlamı

Şifre ve kimlik çerezlerini kaydetmemek için trace kapalıdır. Admin şifresi yalnız ortam değişkeninden okunur.

Çalıştırma:

```sh
pnpm --filter @mol/e2e exec playwright test -c live/playwright.config.ts
pnpm --filter @mol/e2e exec tsc -p live/tsconfig.json
pnpm verify
```

`pnpm verify` geçti: typecheck, lint, 426 test ve build. Canlı dosyalar ayrıca kendi `tsconfig.json` dosyasıyla typecheck edildi ve lint geçti. Wrangler yerel log dizinine yazamadığı için EROFS uyarısı verdi; doğrulamanın çıkış kodu 0. Normal e2e yapılandırması değiştirilmedi; canlı yapılandırmada webServer/globalSetup yoktur.

Açık konular: test kategorisi oluşturma izni veya mevcut aktif kategori/meme sağlanması; canlı Worker'ın gerçek YouTube oEmbed erişim hatasının araştırılması. Bu görev kapsamında hata düzeltilmedi.

Commit denenmiş ancak `git add` aşamasında worktree'nin ortak Git dizininde `index.lock` oluşturulamadı (salt okunur dosya sistemi). Dosyalar çalışma ağacında bırakıldı; commit ve push yapılmadı.
