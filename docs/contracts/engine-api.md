# Sözleşme: Oyun Motoru API'si (`packages/engine`)

- **Sürüm:** v0.1 taslak (orchestrator, 2026-10-18)
- **Kurallar kaynağı:** `docs/PRODUCT_SPEC.md`. Bu doküman yalnız motorun **şeklini** tanımlar; kurallar spesifikasyondadır.
- **Değişiklik:** Uygulayan worker gerekçeli değişiklik önerebilir; sözleşme yalnız orchestrator onayıyla değişir. Ayrıntı (alan adları, yardımcı tipler) uygulamada serbestçe eklenebilir; aşağıdaki **ilkeler ve sınırlar** değişmez.

---

## 1. İlkeler

1. **Saf ve deterministik.** Motor I/O yapmaz (ağ, saat, veritabanı, `Math.random`, `Date.now` yok). Aynı girdi → aynı çıktı.
2. **Saat ve rastgelelik dışarıdan.** Her çağrı `ctx.now` (ms) alır; rastgelelik oturuma özel tohumlu bir PRNG ile yapılır ve PRNG durumu motor durumunun parçasıdır (yeniden başlatmada aynı sonuç).
3. **Tek giriş noktası:** `reduce(state, command, ctx) → { state, events, nextDeadline }`.
4. **Zamanlayıcıları motor yönetmez, ister.** Motor bir sonraki zaman sınırını (`nextDeadline`) döndürür; kabuk (Durable Object) o anda bir `tick` komutu gönderir. Erken/geç `tick` güvenlidir (idempotent).
5. **Görünürlük motorda.** Kim neyi görebilir (anonimlik, gönderen gizliliği, yöneticiye özel bilgiler) motorun `project()` fonksiyonunda çözülür; kabuk ham durumu asla istemciye göndermez.
6. **Serileştirilebilir durum.** `EngineState` düz JSON'dur (sınıf, fonksiyon, Map/Set yok); kabuk onu olduğu gibi saklar ve geri yükler.
7. **Komut reddi istisna değildir.** Geçersiz komut durum değiştirmez ve `events` içinde `commandRejected` (neden kodu ile) döner.

---

## 2. Ana fonksiyonlar

```ts
createSession(init: SessionInit, ctx: Ctx): EngineState;

reduce(state: EngineState, cmd: Command, ctx: Ctx): {
  state: EngineState;
  events: EngineEvent[];       // yayın, animasyon ve denetim kaydı için
  nextDeadline: number | null; // ms; null = bekleyen zamanlayıcı yok
};

project(state: EngineState, viewer: Viewer, ctx: Ctx): View; // istemciye giden tek şey

estimateDuration(config: SessionConfig, playerCount: number): { minMs: number; maxMs: number };
```

```ts
type Ctx = {
  now: number;                 // ms
  prompts: PromptRef[];        // o andaki aktif durum havuzu (platform + işletme); kabuk sağlar
  timing: TimingConstants;     // sunucu ayarı sabitleri (aşağıda)
};

type Viewer =
  | { kind: 'participant'; participantId: string }
  | { kind: 'manager' }
  | { kind: 'display' };
```

`ctx.prompts` canlı havuzdur (spesifikasyon 6.3). Motor tekrar kuralını (`usedPromptIds`, havuz bitince en uzun süre önce kullanılanlar) kendisi uygular.

---

## 3. Durum (taslak şekil)

```ts
type EngineState = {
  version: number;
  rng: RngState;
  config: SessionConfig;         // mod, lig tur sayısı, süreler, özel içerik, onay modları, seyirci kabulü
  status: 'lobby' | 'running' | 'paused' | 'finished' | 'terminated';
  participants: Record<string, Participant>;
  phase: Phase;                   // aşağıda
  rounds: Round[];                // tamamlanan + süren
  stage: StageState;              // moda göre: eleme ağacı / lig tablosu / hibrit aşamaları
  usedPromptIds: Record<string, number>; // promptId → son kullanım (tur sırası)
  promptPreview: PromptRef | null;       // sonraki turun önizlemesi (yönetici)
  pausedFrom: Phase | null;
  result: FinalResult | null;     // sıralama, şampiyon, jüri ödülleri
};

type Participant = {
  id: string;
  nickname: string;
  role: 'player' | 'voter';
  status: 'pending' | 'active' | 'left' | 'kicked';
  connected: boolean;
  votingFromRound: number;        // geç katılım kuralı
  byeCount: number;
};

type Phase =
  | { kind: 'lobby' }
  | { kind: 'selection'; roundNo: number; endsAt: number; promptReplaceUntil: number }
  | { kind: 'presentation'; roundNo: number; index: number; lastCallAt: number; endsAt: number }
  | { kind: 'review'; roundNo: number; endsAt: number }
  | { kind: 'reveal'; roundNo: number; step: number; nextStepAt: number }
  | { kind: 'results'; roundNo: number; endsAt: number }
  | { kind: 'draw'; roundNo: number; endsAt: number }  // kura animasyonu
  | { kind: 'finished' };

type MediaRef =
  | { source: 'system'; memeId: string; mediaType: 'image' | 'gif' | 'video'; durationMs?: number }
  | { source: 'upload'; uploadId: string; mediaType: 'image' | 'gif' }
  | { source: 'youtube'; videoId: string; startMs: number; endMs: number };
```

`Round` en az şunları taşır: tur numarası, tür (`regular` | `overtime`), bağlam (`elimination` | `league` | `semifinal` | `final`), durum metni ve sahibi (oynandığı andaki metin), eşleşmeler ve baylar, gönderiler (oyuncu, medya, onaylı mı, geçersiz mi, gizlendi mi), gösterim sırası, puanlar (`raterId → submissionId → 1..5`), puanlama yetkisi anlık görüntüsü (gösterim başlarken hesaplanan), sonuçlar.

---

## 4. Komutlar

```ts
type Command =
  // Yönetici
  | { type: 'updateSettings'; patch: Partial<SessionConfig> }
  | { type: 'approveParticipant'; participantId: string }
  | { type: 'rejectParticipant'; participantId: string }
  | { type: 'start' }
  | { type: 'pause' } | { type: 'resume' }
  | { type: 'addTime'; seconds: 15 | 30 | 60 }
  | { type: 'replacePrompt' }
  | { type: 'rejectCustom'; participantId: string }
  | { type: 'hideCurrent' }
  | { type: 'closeReview' }
  | { type: 'skipResults' }
  | { type: 'moveToVoter'; participantId: string }
  | { type: 'kick'; participantId: string }
  | { type: 'resetNickname'; participantId: string }
  | { type: 'endGame' }
  // Katılımcı (kabuk kimliği doğrular ve participantId'yi ekler)
  | { type: 'join'; participantId: string; nickname: string; wants: 'player' | 'voter' }
  | { type: 'select'; participantId: string; media: MediaRef }
  | { type: 'confirm'; participantId: string }
  | { type: 'rate'; participantId: string; submissionId: string; score: 1 | 2 | 3 | 4 | 5 }
  | { type: 'finishReview'; participantId: string }
  | { type: 'leaveToVoter'; participantId: string }
  | { type: 'changeNickname'; participantId: string; nickname: string }
  // Sistem (kabuk)
  | { type: 'tick' }
  | { type: 'connection'; participantId: string; connected: boolean }
  | { type: 'restore' }; // sunucu yeniden başlatıldı: spesifikasyon 12.4'e göre devam
```

- Cihaz devri, oturum açma, hak düşürme, ortak ekran eşleştirme ve dosya yükleme **kabuğun** işidir; motora yalnız sonuçları (ör. `join`, `select`) ulaşır.
- Hak düşürme `start` kabul edildikten sonra kabukta yapılır (motor `sessionStarted` olayı yayar).

---

## 5. Olaylar (taslak)

`participantJoined`, `participantChanged`, `phaseChanged`, `matchupsAnnounced`, `byeAnnounced`, `submissionUpdated` (yönetici görünümü), `customRejected`, `contentHidden`, `ratingProgress` (kaç kişi puan verdi), `revealStep`, `roundResult`, `eliminated`, `overtimeStarted`, `drawPerformed`, `sessionStarted`, `sessionFinished`, `commandRejected`.

Olaylar hem istemci animasyonları hem de rapor/denetim kaydı için kullanılır; kalıcı kayda neyin yazılacağına kabuk karar verir.

---

## 6. Zamanlama sabitleri (`TimingConstants`, sunucu ayarı)

| Sabit | Değer |
|---|---|
| Resim/GIF izleme + son karar | 12 sn + 3 sn |
| Video izleme | max(klip, 12 sn) + 5 sn son karar |
| Sonuç ekranı | 15 sn (açıklama bittikten sonra) |
| Sıralı açıklama adımı | 1,5 sn |
| Uzatma turu seçim süresi | 30 sn |
| Acil durum değiştirme penceresi | 15 sn |
| Kura animasyonu | 5 sn |
| Bağlı katılımcı yokken otomatik bitiş | 10 dk |

Lobi ömrü (24 saat) motorun değil kabuğun sorumluluğudur.

---

## 7. Test beklentisi (M1 bitti tanımının parçası)

- Spesifikasyondaki her kural için en az bir senaryo testi (Bölüm 7–12, 8.3, 16'nın oyunla ilgili kısımları).
- **Özellik tabanlı simülasyon:** 2–64 oyuncu, 0–300 seyirci, üç mod, rastgele davranışlar (seçmeyen, puanlamayan, ayrılan, atılan, bağlantısı kopan, gizlenen içerik, duraklatma, yeniden başlatma) ile binlerce oyun. Değişmezler:
  - Oyun her zaman sonlu sayıda adımda `finished`/`terminated` olur.
  - Kimse kendi gönderisini puanlayamaz; düello kuralı ve istisnası her zaman korunur.
  - Gösterim bitene kadar `project()` hiçbir katılımcıya gönderen bilgisi sızdırmaz.
  - Aynı tohum ve komut dizisi → birebir aynı sonuç.
  - Durum her adımda JSON gidiş-dönüşüne dayanır.
