# Görev: M7b — Oda performansı (300 katılımcı hedefi)

Worker: Codex (gpt-6.1-sol, medium) · Dal: `m7b-perf`

## Oku
AGENTS.md · docs/contracts/protocol.md (v0.2) · apps/server/README.md · tools/loadtest/README.md · docs/PRODUCT_SPEC.md Bölüm 17

## Durum (orchestrator ölçümü, 2026-10-19)
`tools/loadtest` ile yerel `wrangler dev`'de:
- 50 katılımcı (4 oyuncu + 46 seyirci, lig 1 tur): tamamlandı; ACK p50/p95/maks 269/767/891 ms.
- 300 katılımcı (16 + 284, lig 2 tur): **oyun başlamadan** ~137. katılımda Workers runtime "crashed unexpectedly" ile çöktü; bir `join` 30 sn yanıtsız kaldı. Çökmeden önce `join` süreleri 0,5–0,8 sn ve artıyordu. Codex M7a sırasında da benzer bir çökme görmüştü.

İlk incelemedeki şüpheler (doğrula, körü körüne uygulama):
- Her `join`/`connection` değişiminde tüm soketlere tam görünüm → katılımcı sayısının karesiyle büyüyen iş (projeksiyon + JSON.stringify soket başına).
- `broadcast()` her yönetici soketi için D1 sorgusu (`authorized`) yapıyor; her mesajda da.
- Her komutta tüm oda durumu (`room`) birden çok kez depoya yazılıyor; durum katılımcı ve oy sayısıyla büyüyor.
- Tüm mesajlar `blockConcurrencyWhile` içinde sırayla işleniyor; 300 kişinin aynı anda puan vermesi kuyruk oluşturuyor.

## Amaç
300 eşzamanlı katılımcılı bir odada oyunun güvenle tamamlanması ve hedeflerin tutması.

## Kapsam
1. Önce çökmenin nedenini bul (yerel ortama özgü mü, kodumuz mu: bellek, soket/istek sınırı, CPU süresi vb.). Bulguyu özetle.
2. Sunucu odasını (`apps/server`) ölçeklenir hale getir. Serbestsin; örnekler: görünüm yayınlarını toplamak (protokol zaten "yüksek frekanslı güncellemeler toplanır" diyor; `join`/`connection`/lobi değişimleri de toplanabilir, aşama geçişleri gecikmesiz kalmalı), aynı görünüme sahip izleyiciler için projeksiyonu/serileştirmeyi paylaşmak (ör. tüm seyirciler aynı görünümü alıyorsa bir kez hesapla), yönetici yetki kontrolünü önbelleklemek, depoya yazmayı küçültmek/bölmek.
3. Motor (`packages/engine`) yalnız **davranış değişmeden** hızlandırılabilir; tüm mevcut testler aynen geçmeli. Motor API'si, protokol veya DB şeması değişikliği gerekiyorsa uygulama; gerekçeyle öner (SPEC-QUESTION / CONTRACT-QUESTION).
4. Doğruluk korunur: idempotentlik, kurtarma, `superseded`, sızıntı yok, aşama farkı. Mevcut sunucu testleri geçer; yaptığın toplama/önbellek için test ekle.
5. Ölçüm: `tools/loadtest` ile yerelde 50 ve 300 katılımcı (16 + 284, lig 2 tur, `--reconnect-rate` varsayılan). Önce/sonra sonuçlarını raporla. Yük aracında hata görürsen düzeltebilirsin.

## Kapsam dışı
Web arayüzü (başka bir worker `apps/web` ve `apps/e2e` üzerinde çalışıyor; dokunma). Uzak Cloudflare işlemleri. `docs/` değişikliği. `packages/engine/src/projection.ts` dosyasında yalnız zorunluysa ve küçük değişiklik (başka dalda bu dosyaya alan ekleniyor).

## Bitti tanımı
- Yerelde 300 katılımcılı koşu tamamlanır; ACK p99 ≤ 1000 ms, aşama farkı ≤ 1000 ms, hata yok (ya da kalan sorunun yerel ortama özgü olduğu kanıtıyla açıklanır).
- `pnpm verify` geçer.
- Yerel testlerde sunucuyu 8787 dışında bir portta aç (8787'yi başka worker kullanıyor); açtığın süreçleri sonunda kapat. Git'e yazamıyorsan commit atma. Push yok.

## Teslim
Kısa özet: çökme nedeni, yapılan değişiklikler, önce/sonra ölçümleri, açık sorular.
