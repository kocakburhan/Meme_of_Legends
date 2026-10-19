# Sözleşme: Admin API'si ve sistem medyası (M5)

- **Sürüm:** v0.1 (M5a, 2026-10-19; orchestrator onayladı — adına giriş süresi 12 saate çıkarıldı)
- **İlgili:** PRODUCT_SPEC Bölüm 6, 12.3, 15, 16; db-schema.md.
- `/api/admin/*` yalnız admin oturumuyla (`mol_admin_session`) çalışır. Çerezsiz/işletme çerezli istek `401 UNAUTHENTICATED`. Yazmalar mevcut aynı-köken denetimine tabidir. Tüm başarılı admin yazmaları aynı D1 transaction'ında `admin_actions` kaydı üretir. Şifreler/token'lar loglanmaz.
- İstek/yanıt Zod şemalarının kaynağı `packages/shared/src/admin.ts`; tipler bu şemalardan `z.infer` ile alınır. JSON istekleri strict'tir. Hatalar `{ error: { code, existingId? } }`. Bozuk JSON/filtre `400 INVALID_REQUEST`, JSON olmayan yazma `415 JSON_REQUIRED`, olmayan kayıt `404`.

## 1. İşletmeler ve kriz araçları

| Uç | İstek / yanıt |
|---|---|
| `GET /api/admin/businesses?q=&active=all` | Ad/kullanıcı adı araması (Türkçe normalize); `active=true/false/all`. `{ businesses: AdminBusiness[] }`. Mevcut liste biçimi korunur. |
| `POST /api/admin/businesses` | `{ name, username, credits, password? }` → `201 { business, credentials: { loginUrl, username, temporaryPassword, summary } }`; giriş rotası `/isletme/giris`. `409 USERNAME_TAKEN`. |
| `GET /api/admin/businesses/:id` | `{ business, usage }` |
| `PATCH /api/admin/businesses/:id` | `{ creditsDelta?, unlimitedCredits?, active?, concurrentSessionLimit?, lobbyLifetimeHours? }` → `{ business }`. Negatif bakiye `409 INSUFFICIENT_CREDITS`. Pasifleştirme mevcut oturum iptali davranışını korur. |
| `POST /api/admin/businesses/:id/password` | `{ password? }` → `{ temporaryPassword }`; işletme girişleri iptal edilir. |
| `POST /api/admin/businesses/:id/impersonate` | Gövdesiz → `{ loginUrl, expiresAt }` + `mol_business_session` çerezi (HttpOnly, SameSite=Strict, HTTPS'te Secure; 12 saat — canlı müdahale bir oyun boyunca sürebilir). `409 BUSINESS_INACTIVE`. |
| `POST /api/admin/sessions/:id/terminate` | Gövdesiz → `{ ok: true }`. DO'nun `/close` yoluyla motorun mevcut `endGame` komutu kullanılır; son durum `terminated`, neden `adminTerminated`, müdahale bayrağı. Aynı admin kapatması tekrarlanabilir (tek log); bitmiş başka oturum `409 SESSION_NOT_ACTIVE`. |
| `POST /api/admin/sessions/:id/refund` | Gövdesiz → `{ ok: true }`. Yalnız gerçekten harcanmış hak (`creditCharged`, eski kayıtta `creditConsumed`), oturum başına bir kez: atomik bayrak + bakiye + log. `409 CREDIT_ALREADY_REFUNDED` / `CREDIT_NOT_CONSUMED`. |

Adına giriş, tarayıcıdaki mevcut **işletme** çerezini değiştirir; admin çerezine dokunmaz. Web başarılı yanıttan sonra `loginUrl`'yi yeni sekmede açabilir. Normal işletme logout/parola sıfırlama/pasifleştirme bu oturumu da iptal eder. Giriş bağlantısı token içermez; çerezle kullanılır. `businessImpersonated` kaydında yalnız bitiş zamanı bulunur.

```ts
type AdminBusiness = {
  id: string; name: string; username: string; active: boolean;
  credits: number; unlimitedCredits: boolean; concurrentSessionLimit: number;
  lobbyLifetimeHours: number; createdAt: number;
};
type AdminUsage = {
  sessionCount: number; activeSessionCount: number;
  consumedCredits: number; refundedCredits: number; lastGameAt: number | null;
};
```

## 2. Raporlar

| Uç | Filtre / yanıt |
|---|---|
| `GET /api/admin/sessions` | `businessId?`, `status=all/active/past/lobby/running/paused/finished/cancelled/terminated`, `from?`, `to?` (oluşturulma epoch ms, iki sınır dahil), `cursor?`, `limit?`. `{ sessions: AdminSession[], nextCursor }`. |
| `GET /api/admin/sessions/:id` | `{ session, business, report, audit, adminActions, errors }`. Canlı rapor DO snapshot'ından, bitmiş rapor `session_reports.summary`'den okunur; rapor yoksa `null`. |
| `GET /api/admin/usage` | `{ businesses: { business, usage }[] }` |
| `GET /api/admin/errors` | `sessionId?`, `source?`, `code?`, `cursor?`, `limit?` → `{ errors, nextCursor }` |
| `GET /api/admin/actions` | `targetId?`, `action?`, `cursor?`, `limit?` → `{ actions, nextCursor }` |

```ts
type AdminSession = {
  id: string; businessId: string; roomCode: string;
  status: 'lobby'|'running'|'paused'|'finished'|'cancelled'|'terminated';
  mode: 'elimination'|'league'|'hybrid'; settings: SessionConfig;
  createdAt: number; expiresAt: number; startedAt: number|null;
  endedAt: number|null; endReason: string|null;
  creditConsumed: boolean; creditCharged: boolean|null;
  creditRefunded: boolean; adminIntervention: boolean;
};
// report: takma ad/rol/durum listesi ve oyuncu/seyirci sayıları;
// rounds: no/kind/context/prompt (id, owner, oynandığı andaki text),
// players/matches/byes, scores (votes/average), resolution, locked,
// submissions (id/playerId/memeId/customType/hidden/invalid);
// result: champion/ranking/jury/reason. Özel medya URL/kimlikleri dönmez.
type Audit = { id: string; sessionId: string; occurredAt: number; type: string; payload: unknown };
type AdminAction = { id: string; occurredAt: number; action: string; targetId: string; details: unknown };
type SystemError = { id: string; occurredAt: number; source: string; sessionId: string|null; code: string; details: unknown };
```

Denetim kaydı mevcut motor olaylarından çıkarma, gizleme, duraklatma/devam ve erken bitiş zamanlarını taşır. Payload güvenli olay alanlarıyla sınırlandırılır; özel medya ve serbest istemci metni taşınmaz. Hata listesi kaynak/kod/oturum/zaman verir; özel içerik sızıntısına karşı ham hata ayrıntıları aktarılmaz. Henüz üretilmemiş medya hata kayıtları uydurulmaz. Admin oturum sonlandırma ve iade kayıtları oturum detayında ayrıca görünür. Takma adlar bitişten yedi gün sonra yanıt sınırında anonimleştirilir. Rapor depolama biçimi genişletilmedi. `creditConsumed` eski başlatma işaretidir; yeni oyunlarda `creditCharged` gerçek bakiye düşümünü kaydeder. Sınırsız başlatmalar `creditCharged=false` olduğu için iade edilemez; kullanım özetinde harcanan hak sayısına girmez. Geçmişte gerçek düşüm bilgisi tutulmayan kayıtlar (`creditCharged=null`) mevcut `creditConsumed` davranışını korur.

Sayfalanan listeler `(createdAt,id)` azalan; loglar `(occurredAt,id)` azalan sıradadır. Limit varsayılan 50, üst sınır 100. `nextCursor: string|null` opaktır, filtre ve uç kapsamına bağlıdır; başka kapsamda kullanılması `400 INVALID_REQUEST`. Aynı zaman damgalı satırlar ID ile ayrılır. Boş sayfa `[]` ve `null` döner.

## 3. Kategoriler ve durumlar

| Uç | İstek / yanıt |
|---|---|
| `GET /api/admin/categories` | `{ categories }` (arşivliler dahil; `sortOrder,id` artan) |
| `POST /api/admin/categories` | `{ name, sortOrder?: number }` → `201 { category }` |
| `PATCH /api/admin/categories/:id` | `{ name?, sortOrder?, archived? }` → `{ category }`; her satırın sırası ayrı güncellenir. |
| `GET /api/admin/prompts` | `q?`, `status=all/active/archived`, `cursor?`, `limit?` → `{ prompts, nextCursor }` (yalnız platform) |
| `POST /api/admin/prompts` | `{ text }` → `201 { prompt }` |
| `PATCH /api/admin/prompts/:id` | `{ text?, status?: 'active'|'archived' }` → `{ prompt }` |
| `GET /api/admin/prompts/health` | `{ activeCount, lowThreshold: 30, low }` |
| `GET /api/admin/business-prompts` | `businessId?`, `q?`, `blocked=true/false/all`, `cursor?`, `limit?` → `{ prompts, nextCursor }` |
| `PATCH /api/admin/business-prompts/:id` | `{ adminBlocked: boolean }` → `{ prompt }`; metin düzenlenemez. |

```ts
type Category = { id: string; name: string; sortOrder: number; archived: boolean };
type AdminPrompt = {
  id: string; ownerType: 'platform'|'business'; businessId: string|null;
  text: string; normalizedText: string; status: 'active'|'archived';
  adminBlocked: boolean; createdAt: number; updatedAt: number;
};
```

Platform metinleri işletme ile aynı `promptTextSchema`/`normalizePromptText` kurallarını kullanır; geçersiz metin `422 PROMPT_INVALID`. Platform içi (arşiv dahil) tekrar `409 PROMPT_DUPLICATE` ve `existingId`. Platform ile işletme aynı metne sahip olabilir. Azlık eşiği sunucu sabitidir; aktif/engelsiz platform durumları sayılır.

## 4. Sistem meme'leri

| Uç | İstek / yanıt |
|---|---|
| `GET /api/admin/memes` | `q?` (açıklama), `categoryId?`, `status=all/untagged/active/archived`, `order=newest/oldest`, `cursor?`, `limit?` → `{ memes, nextCursor }` |
| `GET /api/admin/memes?status=untagged&order=oldest&limit=1` | Etiket kuyruğundaki en eski kayıt |
| `PATCH /api/admin/memes/:id` | `{ categoryId?: string|null, description?, status? }` → `{ meme }`; aktif kayıt kategori ve boş olmayan açıklama ister (`422 MEME_TAGS_REQUIRED`). |
| `GET /api/admin/memes/check?sourceUrl=` | `{ existingId: string|null }`; arşiv dahil tam URL eşitliği. |
| `POST /api/admin/memes` | Aşağıdaki sabit multipart biçimi → `201 { meme }` |

```ts
type MemeMeta = {
  mediaType: 'image'|'gif'|'video'; durationMs?: number; sourceUrl?: string;
  categoryId?: string; description?: string;
};
type AdminMeme = {
  id: string; categoryId: string|null; description: string;
  mediaType: 'image'|'gif'|'video'; r2Key: string; coverKey: string|null;
  durationMs: number|null; sourceUrl: string|null;
  status: 'untagged'|'active'|'archived'; createdAt: number;
  mediaUrl: string; coverUrl?: string;
};
```

Multipart `file` zorunlu, `cover` isteğe bağlı, `meta` JSON metnidir. Ana dosya JPEG/PNG/WebP, GIF veya H.264 MP4 (ses varsa AAC); kapak JPEG/WebP. Her dosya en fazla 50 MiB. MIME/dosya imzası uyumsuzluğu, geçersiz MP4 örnek tanımı/kodeği, boş/büyük dosya veya bozuk meta `422 MEDIA_INVALID`. Video `durationMs` zorunlu ve 1–25.000 ms. Süreyi yerel araç ölçer; sunucu dönüştürme veya tam medya decode işlemi yapmaz. Var olmayan kategori `422 CATEGORY_NOT_FOUND`.

Kategori ve dolu açıklama birlikte verilince `active`, aksi halde `untagged`. `sourceUrl` tüm durumlar dahil benzersizdir: `409 { error: { code: 'MEME_DUPLICATE', existingId } }`. DB benzersizlik kuralı eşzamanlı yüklemeyi de korur; başarısız yüklemenin yeni R2 nesneleri temizlenir. Anahtarlar `memes/<id>/media.<ext>`, `memes/<id>/cover.<ext>`; içerik bu anahtarlarda değiştirilmez. URL'ler aynı kökene göreli `/media/...` adresleridir.

## 5. Medya sunumu ve kütüphane

- `GET`/`HEAD /media/<r2Key>`: yalnız sistem meme anahtarları, çerez gerekmez. Doğru MIME, `ETag`, `Accept-Ranges: bytes`, `Cache-Control: public, max-age=31536000, immutable`, `nosniff`.
- Tek byte aralığı (`start-end`, `start-`, `-suffix`) → `206`, `Content-Range`, doğru uzunluk. Karşılanamayan aralık `416 bytes */size`; geçersiz/çoklu aralık yok sayılır ve tam `200`. `If-Range` desteklenir; `If-None-Match` eşleşmesi `304`.
- `GET /api/rooms/:code/library` mevcut alanları korur ve `mediaUrl`, varsa `coverUrl`, `durationMs: number|null` ekler. Paylaşılan `libraryResponseSchema` web tarafından da kullanılır. Eski sahte veriler için ek alanlar şemada isteğe bağlıdır.
- Yeni tablo yoktur. Drizzle migration’ları `memes.source_url` ve platform `prompts.normalized_text` için benzersiz indeksler ve `game_sessions.credit_charged` nullable bayrağını ekler. Eski mükerrer veriler varsa migration öncesi orchestrator tarafından temizlenmelidir; migration veri silmez.

**CONTRACT-QUESTION (orchestrator incelemesi):** v0.1 uçları ve ek şemalar onaya sunuluyor. M5 öncesi sınırsız oyunların gerçek hak düşümü tarihçesi bulunmuyor; bu kayıtlar için eski `creditConsumed` davranışı korunuyor. Yeni oyunlarda belirsizlik yoktur.
