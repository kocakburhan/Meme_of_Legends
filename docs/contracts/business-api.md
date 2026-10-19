# Sözleşme: İşletme API'si ve yönetici görünümü eklemeleri (M4)

- **Sürüm:** v0.1 (orchestrator, 2026-10-19)
- **İlgili:** `docs/contracts/protocol.md`, `docs/PRODUCT_SPEC.md` Bölüm 3, 4, 6.2, 14
- Tüm uçlar işletme oturum çerezi ister (`authenticate(..., 'business')`); başka işletmenin kaydı her zaman `404 NOT_FOUND`. Hata gövdesi mevcut biçimde: `{ error: { code } }`. İstek/yanıt şemaları `packages/shared` içinde tanımlanır; web aynı şemalarla doğrular.

## 1. Mevcut (değişmez)
| Uç | Not |
|---|---|
| `GET /api/business/me` | `{ business }` (ad, kalan hak, sınırsız mı, eşzamanlı oturum sınırı, lobi ömrü) |
| `POST /api/business/sessions` `{ settings? }` | Lobi aç → `201 { session }`; `409 INSUFFICIENT_CREDITS` / `CONCURRENT_SESSION_LIMIT` |
| `POST /api/business/sessions/:id/cancel` | Lobi iptal |
| `POST /api/auth/business/login` / `logout` / `password` | Oturum ve şifre (diğer cihazlar kapanır) |

## 2. Yeni uçlar
| Uç | Yanıt |
|---|---|
| `GET /api/business/sessions?status=active` | `{ sessions: SessionSummary[] }` — lobi/oyun/duraklatılmış oturumlar ("Oyuna dön") |
| `GET /api/business/sessions?status=past&cursor=&limit=20` | `{ sessions: SessionSummary[], nextCursor: string \| null }` — biten/iptal/sonlandırılan, yeniden eskiye |
| `GET /api/business/sessions/:id` | `{ session: SessionSummary, report: SessionReport \| null }` |
| `GET /api/business/prompts?q=&status=active\|archived\|all&cursor=&limit=50` | `{ prompts: BusinessPrompt[], nextCursor }` — arama metinde, büyük/küçük harf duyarsız (Türkçe) |
| `POST /api/business/prompts` `{ text }` | `201 { prompt }`; `422 PROMPT_INVALID` (3–160 karakter, link/HTML yok), `409 PROMPT_DUPLICATE` |
| `PATCH /api/business/prompts/:id` `{ text?, status?: 'active' \| 'archived' }` | `{ prompt }`; aynı doğrulama ve tekrar kuralı |

```ts
type SessionSummary = {
  id: string; roomCode: string;
  status: 'lobby' | 'running' | 'paused' | 'finished' | 'cancelled' | 'terminated';
  mode: 'elimination' | 'league' | 'hybrid';
  createdAt: number; startedAt: number | null; endedAt: number | null; endReason: string | null;
  playerCount: number | null; spectatorCount: number | null; // rapor yoksa null
  champion: string | null;                                     // takma ad (anonimleşmişse anonim ad)
};
type SessionReport = {
  rounds: number;
  standings: { rank: number; nickname: string; score: number }[];
  juryAwards: { title: string; nickname: string }[];
  hiddenContentCount: number;
};
type BusinessPrompt = {
  id: string; text: string; status: 'active' | 'archived';
  adminBlocked: boolean; createdAt: number; updatedAt: number;
};
```
- Tekrar kuralı (SPEC 6.2): aynı işletmede normalize edilmiş metin (Türkçe küçük harf, baş/son boşluk kırpılmış, iç boşluklar teke indirilmiş) birebir aynıysa `409 PROMPT_DUPLICATE`. Arşivli kayıtla çakışma da tekrardır (yanıt `existingId` taşır ki web "yeniden etkinleştir" önersin).
- `adminBlocked` işletme tarafından değiştirilemez; engelli durum düzenlense de engelli kalır.

## 3. Yönetici (ve ortak ekran) görünümü eklemeleri — `View`
Yalnız ekleme; mevcut alanlar değişmez.
```ts
// View
review?: { finished: number; eligible: number };  // final gözden geçirme sırasında; manager ve display görür
isFinalRound?: boolean;                            // mevcut tur oyunun son turuysa (sonuç ekranında "Final sonuçları geliyor" için)
```
- `isFinalRound`, motorun bildiği kesin bilgiden üretilir (lig son turu, eleme finali, hibrit final serisinin son maçı); beraberlik nedeniyle uzatma turu gelecekse `false`.
- Yönetici görünümü seçim sırasında gelen özel içerikleri (gönderen dahil) zaten görmelidir; görmüyorsa eklenir (SPEC 7.1, 14.2).
