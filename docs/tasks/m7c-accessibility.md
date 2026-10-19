# Görev: M7c — Erişilebilirlik denetimi ve düzeltmeleri (web)

Worker: OpenCode (deepseek-v4.1-flash, max) · Dal: `m7c-a11y`

## Oku
AGENTS.md · docs/PRODUCT_SPEC.md Bölüm 16A.3 (hareket), 18 (erişilebilirlik), 19 · apps/web (tüm ekranlar) · apps/e2e (mevcut testler ve `helpers/driver.ts`)

## Amaç
Tüm ekranları WCAG 2.1 AA'ya getirmek ve bunu otomatik testlerle korumak.

## Kapsam
1. `apps/e2e`'ye `@axe-core/playwright` ekle; şu ekranları WCAG 2.1 AA kurallarıyla tara ve ihlalleri düzelt: katılım (`/`), lobi, seçim (Kütüphane sekmesi), gösterim + puanlama, final gözden geçirme, sonuç, oyun sonu; ortak ekran (`/ekran` eşleştirme + oyun sahneleri); işletme girişi, işletme paneli sayfaları, konsol (lobi, seçim, gösterim kartları, Katılımcılar, Ayarlar); admin girişi ve admin paneli sayfaları. Mevcut oyun yardımcılarıyla (API+WS) gerekli aşamalara getir.
2. SPEC 18'in otomatik yakalanamayanları: tam klavye kullanımı ve görünür odak (puan düğmeleri, sekmeler, basılı tutma "Hemen gizle"nin klavye karşılığı, diyaloglar), diyaloglarda odak tuzağı ve geri dönüş, sayfa başına tek `h1` ve mantıklı başlık sırası, alana bağlı hata mesajları (`aria-describedby`), canlı bölgeler (aşama değişimi, geri sayım bitişi — her saniye duyurma yok, "23/30 kişi puan verdi" gibi sayaçlar kibar), renk tek başına durum göstermez, dokunma hedefleri ≥ 44×44 px (katılımcı ve konsol), %200 metin büyütmede yatay taşma yok (390 px).
3. `prefers-reduced-motion`: animasyonlar kapanır/azalır; e2e'de `reducedMotion: 'reduce'` ile bir akış.
4. Bulduğun ve düzelttiğin sorunların kısa listesi özette.

## Kapsam dışı
Seçim ekranının **Yükle** ve **YouTube** sekmeleri ile konsolun özel içerik listesi (M6b'de yeniden yazılacak; dokunma). Sunucu/motor/shared. Uzak Cloudflare. `docs/`.

## Bitti tanımı
- axe taramaları e2e'de ihlalsiz geçer (gerekçesiz `disableRules` yok; zorunlu istisna varsa gerekçesiyle özette).
- `pnpm verify` ve tüm `pnpm --filter @mol/e2e test:e2e` geçer.
- Dalda mantıklı commit'ler; push yok; depo köküne ekran görüntüsü vb. bırakma; arkada süreç bırakma. 8787/5173 başka bir worker'da kullanılıyor: e2e'yi ve yerel sunucuları **her zaman** `MOL_SERVER_PORT=8797 MOL_WEB_PORT=5183` ile çalıştır (ör. `MOL_SERVER_PORT=8797 MOL_WEB_PORT=5183 pnpm --filter @mol/e2e test:e2e`).

## Teslim
Kısa, doğru özet (uydurma yok): bulunan sorunlar, düzeltmeler, istisnalar.
