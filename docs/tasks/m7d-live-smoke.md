# Görev: M7d — Canlı ortam duman testi (yalnız test, kod değişikliği yok)

Worker: Codex (gpt-6.1-sol, low) · Dal: `m7d-live-smoke`

Canlı adres: https://mol-game.kocakkburhann.workers.dev . Admin: kullanıcı `mol-admin`, şifre `MOL_ADMIN_PASSWORD` ortam değişkeninde (dosyaya/loga/commit'e YAZMA).

## Amaç
Yerelde e2e ile doğrulanmış akışların canlıda da çalıştığını gerçek tarayıcıyla (Playwright) görmek. Zaten doğrulananlar: /health, admin girişi (API), meme yükleme + /media sunumu (Range, kapak), 100 katılımcı yük testi (API+WS, tarayıcısız).

## Kapsam
`apps/e2e/live/` altında ayrı bir Playwright yapılandırması (normal e2e'ye girmez, webServer yok, baseURL canlı adres) ile:
1. Admin paneli: giriş → genel bakış → işletme oluştur (adı "Canlı test <tarih>") → bilgiler → adına giriş.
2. İşletme paneli: o işletmeyle giriş → Yeni oyun → konsol.
3. Ortak ekran (`/ekran`) eşleştirme; 3 oyuncu (ayrı tarayıcı bağlamları, telefon boyutu) + 1 seyirci; özel içerik açık lig 1 tur: bir oyuncu kütüphaneden (canlıda arşivlenmemiş meme yoksa test başında admin API ile küçük bir PNG yükleyip etiketle), biri PNG yükler, biri **gerçek** YouTube linki doğrular ve kırpar (ör. https://www.youtube.com/watch?v=jNQXAC9IVRw); yönetici bir özel içeriği reddeder; gösterim, puanlama, sonuç, oyun sonu.
4. Oyun bitince özel dosya adresinin artık açılmadığını doğrula.
5. Temizlik: oluşturduğun test meme'lerini arşivle, test işletmesini pasife al. Başka hiçbir kaydı değiştirme/silme.

## Kurallar
- Kod, yapılandırma veya Cloudflare kaynağı değişikliği YOK (deploy, wrangler, secret yasak). Yalnız `apps/e2e/live/` dosyaları ve rapor.
- Hata bulursan düzeltme; nedenini (ekran görüntüsü/iz yolu ile) raporla.
- Bitince `pnpm verify` geçmeli (yeni dosyalar lint/typecheck'e uysun). Commit at (yazamıyorsan bırak); push yok.

## Teslim
Kısa Türkçe rapor: her adım geçti/kaldı, bulunan sorunlar, ekran görüntüsü yolları.
