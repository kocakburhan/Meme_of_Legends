# Meme of Legends

İşletmelerin düzenlediği, tarayıcıda oynanan canlı bir meme yarışması.
Katılımcılar QR ile hesapsız katılır, duruma uygun meme seçer, gönderiler anonim
gösterilir ve 1–5 puanlanır.

Ürün tanımı için `docs/PRODUCT_SPEC.md`, yol haritası için
`docs/IMPLEMENTATION_PLAN.md` bakın.

## Yapı

TypeScript monorepo (pnpm workspaces), Cloudflare üzerinde çalışır.

| Konum             | Ne                                                                   |
| ----------------- | -------------------------------------------------------------------- |
| `packages/engine` | Saf oyun motoru (I/O yok; saat ve rastgelelik dışarıdan verilir)     |
| `packages/shared` | Protokol ve ortak tipler                                             |
| `apps/server`     | Cloudflare Worker: Durable Objects, D1, R2                           |
| `apps/web`        | React + Vite tek uygulama (katılımcı, ortak ekran, konsol, paneller) |
| `tools/media`     | yt-dlp + ffmpeg medya hattı (GitHub Actions, M5)                     |

## Kurulum

Gereksinim: Node.js 22+.

```sh
corepack enable pnpm   # veya: npm install -g pnpm
pnpm install
```

## Komutlar

| Komut                               | Ne yapar                                              |
| ----------------------------------- | ----------------------------------------------------- |
| `pnpm typecheck`                    | Tüm paketlerde `tsc` tip denetimi                     |
| `pnpm lint`                         | ESLint                                                |
| `pnpm format` / `pnpm format:check` | Prettier (yaz / denetle)                              |
| `pnpm test`                         | Tüm paketlerin testleri (Vitest)                      |
| `pnpm build`                        | Tüm paketlerin derlemesi                              |
| `pnpm dev`                          | Sunucu ve web uygulamasını paralel yerelde çalıştırır |

Uygulamalar yerelde:

- `apps/web` → <http://localhost:5173>
- `apps/server` → <http://localhost:8787/health>

Tek bir paketi hedeflemek için: `pnpm --filter @mol/engine test` gibi.

## Notlar

- `apps/server/wrangler.jsonc` içindeki `database_id` gibi değerler **yer
  tutucudur**; Cloudflare kaynakları (`mol-db`, `mol-media`) oluşturulduğunda
  güncellenir. M0 kapsamında hiçbir uzak kaynak oluşturulmaz.
- Cloudflare hesabı başka bir projeyle paylaşıldığı için yalnız `mol-` önekli
  kaynaklar kullanılır.
