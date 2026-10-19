# Görev: M7a — Yük testi aracı (300 sanal katılımcı)

Worker: Codex (gpt-6.1-sol, low) · Dal: `m7a-loadtest`

## Oku
AGENTS.md · docs/contracts/protocol.md (v0.2) · apps/server/README.md · docs/PRODUCT_SPEC.md Bölüm 17

## Amaç
Gerçek bir oyunu aynı odada çok sayıda sanal katılımcıyla oynatıp sunucunun kapasite ve senkron hedeflerini ölçen bir komut satırı aracı (`tools/loadtest`). Hedefler: oturum başına 300 eşzamanlı katılımcı; komut onayı ≤ 1 sn; istemciler arası aşama farkı ≤ 1 sn.

## Kapsam
- Node/TypeScript CLI: `pnpm --filter @mol/loadtest start -- --url <sunucu> --players 16 --voters 284 --mode league --rounds 2`.
- API ile admin/işletme/lobi hazırlığı (yerel ortam için yardımcı; uzak ortamda mevcut bir oda kodu da verilebilsin), yönetici bağlantısıyla başlatma.
- Botlar: oyuncular sistem meme'i seçip onaylar; herkes rastgele puan verir; final gözden geçirmede "bitirdim"; bir kısmı rastgele kopup yeniden bağlanır.
- Ölçümler: bağlanma süresi, `ack` gecikmesi (p50/p95/p99), aynı `view.phase` değişiminin istemcilere ulaşma farkı (maks/p95, `serverNow` ve yerel saatle), hata/kopma sayısı, oyunun tamamlanıp tamamlanmadığı. Sonuç tablo + JSON rapor.
- Yerel `wrangler dev` ile kısa doğrulama koşusu (ör. 50 katılımcı) ve README'de nasıl çalıştırılacağı.

## Kapsam dışı
Sunucu veya motor kodu değişikliği (sorun bulursan yalnız raporla). Uzak Cloudflare işlemleri. `docs/` değişikliği.

## Bitti tanımı
- Yerelde 50 katılımcılı koşu tamamlanır ve rapor üretir.
- `pnpm verify` geçer (araç için birkaç birim test yeterli).
- Git'e yazamıyorsan commit atma. Push yok. Arkada çalışan süreç bırakma.

## Teslim
Kısa özet + yerel koşunun ölçüm sonuçları.
