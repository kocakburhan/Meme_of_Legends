# Sözleşme: İstemci–Sunucu Protokolü (`packages/shared`)

- **Sürüm:** v0.2 (orchestrator; v0.1 2026-10-18, v0.2 kabuk işlemleri 2026-10-19)
- **İlgili:** `docs/contracts/engine-api.md`, `packages/engine/README.md`
- Tipler ve doğrulama şemaları `packages/shared` içinde tek kaynaktır; sunucu ve web aynı tanımları kullanır. Değişiklik orchestrator onayıyla.

## 1. İlkeler
1. **İstemciye yalnız `project()` çıktısı gider.** Motor durumu, olaylar (audit) ve başka bir izleyicinin görünümü asla gönderilmez.
2. **Sunucu otoritedir.** İstemci komut gönderir; sonuç her zaman yeni bir görünüm olarak döner. İstemci tarafında iyimser tahmin yalnız görsel geri bildirim içindir.
3. **Komutlar idempotent.** Her istemci komutu benzersiz bir `clientMsgId` taşır; tekrar gelen aynı kimlik ikinci kez uygulanmaz.
4. **Saat senkronu.** Her sunucu mesajı `serverNow` (ms) içerir; istemci geri sayımları sunucu saatine göre hesaplar (aşama farkı ≤ 1 sn hedefi).
5. **Kimlik bağlantı düzeyinde.** Bağlantının rolü (katılımcı / yönetici / ortak ekran) bağlanırken doğrulanır; komut içindeki kimlik alanlarına güvenilmez, sunucu ekler.

## 2. HTTP uçları (taslak)
| Uç | Amaç |
|---|---|
| `GET /api/rooms/:code` | Oda var mı, işletme adı, oyun başladı mı (katılım ekranı için) |
| `POST /api/rooms/:code/join` `{ nickname, wants }` | Katılım; döner: imzalı **katılımcı token'ı** + `participantId` |
| `POST /api/rooms/:code/takeover` `{ nickname }` | Yeni cihazdan devam isteği (yönetici onayı bekler) |
| `POST /api/display/pair` `{ code }` | Ortak ekran eşleştirme; döner: imzalı ekran token'ı |
| `POST /api/auth/business/login`, `/logout`, `/password` | İşletme oturumu (HttpOnly çerez) |
| `POST /api/auth/admin/login`, `/logout` | Admin oturumu (HttpOnly çerez) |
| `/api/business/*`, `/api/admin/*` | Panel işlemleri (REST, M4–M5'te ayrıntılanır) |

## 3. WebSocket
- **Uç:** `GET /api/rooms/:code/ws` — kimlik: katılımcı token'ı (sorgu veya ilk mesaj), yönetici çerezi ya da ekran token'ı.
- Bir oda = bir Durable Object; tüm WebSocket'ler o nesneye bağlanır (Hibernation API).

### İstemci → sunucu
```ts
type ClientMessage =
  | { type: 'cmd'; clientMsgId: string; cmd: ClientCommand } // motor komutu; participantId'yi sunucu ekler
  | { type: 'ping'; t: number };
```
`ClientCommand`, motor `Command` tipinin bağlantı rolüne göre izin verilen alt kümesidir (katılımcı komutları / yönetici komutları). Sistem komutları (`tick`, `connection`, `restore`) istemciden kabul edilmez.

**Kabuk işlemleri (v0.2, orchestrator onayı 2026-10-19):** Motorun bilmediği, odaya ait yönetici işlemleri de aynı WebSocket üzerinden gider:
```ts
type ClientMessage =
  | /* … yukarıdakiler … */
  | { type: 'shell'; clientMsgId: string; action: ShellAction }; // yalnız yönetici bağlantısı

type ShellAction =
  | { kind: 'approveTakeover'; requestId: string }
  | { kind: 'rejectTakeover'; requestId: string }
  | { kind: 'createDisplayPairCode' }   // 6 haneli, tek kullanımlık, 5 dk
  | { kind: 'rematch' };                // aynı oda kodunda yeni lobi (hak kuralları geçerli)
```
Sonuçları normal `ack` ile döner. Yönetici `view` mesajı, motor görünümüne ek olarak kabuk bilgisini taşır:
```ts
type ManagerShellInfo = {
  pendingTakeovers: { requestId: string; participantId: string; nickname: string; requestedAt: number }[];
  displayPairCode: { code: string; expiresAt: number } | null;
  displayConnected: boolean;
};
// yönetici için: { type: 'view'; …; view: View; shell: ManagerShellInfo }
```
Cihaz devri isteği (`POST /api/rooms/:code/takeover`) ve ekran eşleştirme (`POST /api/display/pair`) HTTP uçları olarak kalır. İstek bekleyen yeni cihaz, onay/ret sonucunu aynı uçtan sorgulayarak (kısa aralıklı) öğrenir.

### Sunucu → istemci
```ts
type ServerMessage =
  | { type: 'view'; seq: number; serverNow: number; view: View }      // her durum değişiminde tam görünüm
  | { type: 'ack'; clientMsgId: string; ok: boolean; reason?: string } // komut sonucu
  | { type: 'cue'; serverNow: number; cue: PublicCue }                 // animasyon ipuçları (açıklama adımı, kura, elenme vb.)
  | { type: 'pong'; t: number; serverNow: number }
  | { type: 'recovery'; serverNow: number; resumesAt: number } // sunucu yeniden başlatıldı: istemci 3-2-1 gösterir
  | { type: 'closed'; reason: 'kicked' | 'superseded' | 'sessionEnded' | 'roomExpired' };
```
- `view` tam görünümdür (fark değil); `seq` artan sıra numarasıdır, eski `seq` yok sayılır.
- Yüksek frekanslı güncellemeler (ör. puan sayacı) saniyede en fazla birkaç kez gönderilecek şekilde toplanır.
- `PublicCue` yalnız herkese açık bilgiyi taşır; motor olaylarından kabukta türetilir.

## 4. Yeniden bağlanma
- İstemci bağlantı koparsa üstel bekleme ile yeniden bağlanır; bağlanınca ilk mesaj güncel `view`'dur.
- Aynı katılımcı için yeni bir bağlantı açılırsa eskisi `superseded` ile kapatılır.

## 5. Özel içerik (M6a)

Oda kimliğiyle yükleme, YouTube doğrulama, özel dosya sunumu ve medya hata bildirimi uçları; hata kodları, görünürlük ve saklama kuralları [custom-content.md](custom-content.md) sözleşmesindedir. Yanıt/istek şemaları `customUploadResponseSchema`, `youtubeRequestSchema`, `youtubeResponseSchema`, `mediaErrorRequestSchema` olarak `packages/shared` içinden dışa aktarılır. YouTube `mediaRefSchema.videoId` 11 karakterlik video kimliğidir; kırpma uzunluğu 1–25.000 ms'dir. WebSocket mesaj şekli ve motor API'si değişmez.
