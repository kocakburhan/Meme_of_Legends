# Görev: M4a — İşletme API'si ve yönetici görünümü eklemeleri

Worker: Codex (gpt-6.1-sol, medium) · Dal: `m4a-business-api`

## Oku
AGENTS.md · **docs/contracts/business-api.md (bu işin sözleşmesi)** · docs/contracts/protocol.md · docs/contracts/db-schema.md · apps/server/README.md · packages/engine/README.md · docs/PRODUCT_SPEC.md Bölüm 3, 4, 6.2, 6.3, 7.1, 14

## Amaç
İşletme panelinin (M4c) ve yönetici konsolunun (M4b) ihtiyaç duyduğu sunucu ve motor parçalarını tamamlamak.

## Kapsam
1. `docs/contracts/business-api.md` Bölüm 2'deki uçlar (`apps/server`): aktif/geçmiş oturum listesi (imleçli sayfalama), oturum detayı + rapor, Durumlarım (liste/arama/filtre/sayfalama, oluştur, düzenle, arşivle, yeniden etkinleştir). Tekrar kuralı ve doğrulama (3–160 karakter, link/HTML yok) sunucuda; normalizasyon tek bir paylaşılan yardımcıda (Türkçe küçük harf). Admin engeli işletme tarafından değiştirilemez.
2. İstek/yanıt şemaları `packages/shared` içinde (web aynı şemaları kullanacak).
3. Motor `View` eklemeleri (sözleşme Bölüm 3): `review { finished, eligible }` (manager + display), `isFinalRound` (motorun kesin bilgisinden; uzatma gelecekse false). Yöneticinin seçim sırasında özel içerikleri gönderenle birlikte gördüğünü doğrula, görmüyorsa ekle. Yalnız ekleme; mevcut davranış ve testler korunur, yeni alanlara test.
4. Rapor özeti: `session_reports.summary` içinden `SessionReport` üret; takma adlar anonimleşmişse anonim adlar döner (SPEC 16).
5. `apps/server/README.md`'ye yeni uçları ekle.

## Kapsam dışı
Web arayüzü (`apps/web`, `apps/e2e` başka worker'da). Admin uçları (M5). Uzak Cloudflare işlemleri. `docs/` değişikliği (sözleşmede eksik/çelişki görürsen CONTRACT-QUESTION olarak yaz, uygulama).

## Bitti tanımı
- Her uç için sunucu testleri: yetki (başka işletme 404), doğrulama, tekrar (arşivli kayıtla dahil), sayfalama, admin engeli korunur, rapor anonimleşmesi.
- `pnpm verify` geçer.
- Git'e yazamıyorsan commit atma. Push yok. Arkada süreç bırakma.

## Teslim
Kısa özet, açık sorular.
