# Meme of Legends

İşletmelerin düzenlediği, tarayıcıda oynanan canlı bir meme yarışması. Katılımcılar QR ile hesapsız katılır, duruma uygun meme seçer, gönderiler anonim gösterilir ve 1–5 puanlanır.

## Neye bakmalı
- `docs/PRODUCT_SPEC.md` — ürünün ve oyun kurallarının tek doğruluk kaynağı.
- `docs/IMPLEMENTATION_PLAN.md` — aşamalar ve iş sırası.
- `docs/PROJECT_LOG.md` — kararların gerekçeleri ve teknik seçimler (Bölüm 3–4).

## Yapı
TypeScript monorepo, Cloudflare üzerinde çalışır.
- `packages/engine` — saf oyun motoru (I/O yok; saat ve rastgelelik dışarıdan verilir).
- `packages/shared` — protokol ve ortak tipler.
- `apps/server` — Workers, Durable Objects (oda başına bir), D1, R2.
- `apps/web` — React + Vite tek uygulama (katılımcı, ortak ekran, konsol, işletme ve admin panelleri).
- `tools/media` — yt-dlp + ffmpeg medya hattı (GitHub Actions).

## Çalışma şekli
- Oyun kuralları motorda yaşar ve testlerle korunur; kural değişikliği testsiz girmez.
- Ortak sözleşmeler (motor API'si, protokol, veritabanı şeması) yalnız orchestrator onayıyla değişir.
- Spesifikasyonda karşılığı olmayan bir ürün kararı gerekiyorsa uydurma; durup sor.
- Arayüz metinleri Türkçe, kod ve tanımlayıcılar İngilizce.
- Cloudflare hesabı başka bir projeyle paylaşılıyor: yalnız `mol-` önekli kaynakları oluştur ve değiştir; diğer hiçbir kaynağa dokunma.
- Bitirmeden önce ilgili testleri çalıştır ve kısa bir özet bırak: ne yapıldı, ne yapılmadı, açık sorular.

Bunların dışında araç, yapı ve yaklaşım seçimi sende.
