# Görev: M4c — İşletme paneli

Worker: OpenCode (glm-5.3-flash, max) · Dal: `m4c-panel`

## Oku
AGENTS.md · **docs/contracts/business-api.md** · docs/PRODUCT_SPEC.md Bölüm 3, 4.2, 6.2, 14.4, 16A · docs/PROJECT_LOG.md Bölüm 3.4, 3.5 · apps/server/README.md · `packages/shared/src/business.ts` (şemalar) · apps/web/src/net/ ve M4b'nin giriş/konsol sayfaları

## Amaç
İşletmenin oyun dışındaki her işini yaptığı paneli yazmak (telefon öncelikli; Gece Şovu'nun sakin versiyonu).

## Kapsam
1. **Ana sayfa** (`/isletme`, M4b'deki yer tutucunun yerine): işletme adı, kalan hak (sınırsızsa belirt), **Yeni oyun** (ayarsız lobi açar → konsola `/isletme/oyun/:code`; hak yoksa / eşzamanlı sınır doluysa anlaşılır mesaj), aktif oturumlar → **Oyuna dön**, son oyunlar (kısa liste → Geçmiş). İlk girişte şifre değiştirme önerisi (kapatılabilir bant).
2. **Durumlarım** (`/isletme/durumlar`): arama, durum filtresi (aktif/arşiv/tümü), sayfalama ("daha fazla"), ekle (3–160 karakter canlı sayaç), düzenle, arşivle, yeniden etkinleştir. Hatalar Türkçe: geçersiz metin (link ve HTML olmaz; "nokta sonrası boşluk bırak" ipucu), tekrar → "Bu durum zaten var" + arşivdeyse "Yeniden etkinleştir" düğmesi (`existingId`). Admin engelli durumlarda rozet + açıklama ("Platform tarafından engellendi; oyunlarda çıkmaz").
3. **Geçmiş** (`/isletme/gecmis`): biten/iptal oturumlar, imleçli sayfalama; detay sayfası: mod, tarih, süre, oyuncu/seyirci sayısı, şampiyon, sıralama, jüri ödülleri, gizlenen içerik sayısı, bitiş nedeni (Türkçe).
4. **Hesap** (`/isletme/hesap`): şifre değiştir (mevcut + yeni ×2, en az 12 karakter; başarıda "diğer cihazlardaki girişler kapandı" bilgisi), çıkış.
5. Ortak düzen: alt gezinme (telefon) / yan menü (masaüstü), oturum düşerse `/isletme/giris?next=…`. Yükleniyor / boş / hata durumları. Yanıtlar `@mol/shared` şemalarıyla doğrulanır.
6. **E2E (Playwright):** giriş → Yeni oyun → konsola gidiş → panele dönüş, "Oyuna dön"; durum ekle / tekrar reddi / arşivle / yeniden etkinleştir / ara; şifre değiştir; geçmişte biten bir oyunun detayı (oyun API+WS yardımcısıyla oynatılabilir). Mevcut e2e'ler geçmeye devam eder.

## Kapsam dışı
Sunucu/motor/shared değişikliği (ihtiyaç olursa özetinde yaz). Admin paneli (M5). Uzak Cloudflare. `docs/`.

## Bitti tanımı
- `pnpm verify` ve `pnpm --filter @mol/e2e test:e2e` geçer; 360×740, 390×844, 1280×800'de düzen bozulmaz.
- Dalda mantıklı commit'ler. Push yok. Arkada süreç bırakma. Elle tarayıcı/MCP keşfini en aza indir; asla çözülmeyen beklemeler kullanma.

## Teslim
Kısa, doğru özet (uydurma yok), açık sorular.
