# Görev: M1 takip işi — motor testlerini hızlandır ve puan eşitliğini güvenli yap

Worker: Codex (gpt-6.1-sol, low) · Dal: `m1-followup`

Önce AGENTS.md ve packages/engine/README.md oku.

1. **Test süresi:** `pnpm --filter @mol/engine test` şu an ~4 dk. Varsayılan koşu ~30 sn altına insin (simülasyon sayısını azalt). Ağır koşu ayrı script olsun: `pnpm --filter @mol/engine test:heavy` (ortam değişkeniyle simülasyon sayısı artırılır; mevcut 2.100+ oyun kapsamı korunur). Kökte `pnpm test:heavy` de olsun.
2. **Kayan nokta:** Puan ortalamaları ve toplamları (eşleşme, maç toplamları, lig tabloları, hibrit sınırı, sıralama, jüri ödülleri) tam eşitlikle karşılaştırılıyor. Yuvarlama farkı gerçek bir beraberliği kaçırabilir veya sahte üstünlük yaratabilir. Tüm skor karşılaştırmalarını tek bir yardımcı üzerinden yap (toleranslı karşılaştırma ya da rasyonel/tamsayı gösterim — seçim senin, gerekçeni yaz). Bunu kanıtlayan testler ekle (ör. 1/3+1/3+1/3 ile 1 eşit sayılmalı).

**Kapsam dışı:** başka davranış değişikliği yok. `docs/` altına ve `packages/engine` dışına (kök package.json script'i hariç) dokunma.

**Bitti:** `pnpm verify` ve `pnpm test:heavy` geçer. `m1-followup` dalında commit'le. Push yapma.

**Teslim:** kısa özet (yeni süreler, seçilen yöntem).
