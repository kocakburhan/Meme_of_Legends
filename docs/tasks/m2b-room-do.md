# Görev: M2b — Oyun odası (Durable Object) ve WebSocket

Worker: Codex (gpt-6.1-sol, medium) · Dal: `m2b-room`

## Oku
AGENTS.md · docs/contracts/engine-api.md · packages/engine/README.md · docs/contracts/protocol.md · apps/server/README.md · docs/PRODUCT_SPEC.md (Bölüm 4, 5.5–5.6, 11–14)

## Amaç
`RoomDurableObject`'i motorun etrafında ince bir kabuk olarak tamamlamak: oda başına bir nesne; WebSocket bağlantıları; alarm tabanlı zamanlayıcılar; kalıcı durum; yeniden bağlanma ve yeniden başlatma. Bitince tam bir oyun WebSocket istemcileriyle oynanabilmeli.

## Kapsam
1. **Oda yaşam döngüsü:** M2a'daki lobi oluşturma, odanın DO'sunu başlatır (`createSession`). Oda kodu → DO eşlemesi. Lobi iptali / ömrü dolması / oyun bitişi DO'yu kapatır ve `game_sessions` kaydını günceller.
2. **WebSocket (`GET /api/rooms/:code/ws`):** Hibernation API. Bağlantı kimliği: katılımcı token'ı, yönetici çerezi (o oturumun işletmesi; admin "adına giriş" ileride) veya ortak ekran token'ı. Rol, socket ek bilgisine (attachment) yazılır; uyanınca geri yüklenir.
3. **Komut işleme:** protokoldeki `cmd` mesajları → rol bazlı izin kontrolü → `reduce` → durum kaydı → her bağlantıya kendi `project()` görünümü. `clientMsgId` ile idempotentlik. `ack` yanıtları. Yüksek frekanslı güncellemelerin toplanması (puan sayacı).
4. **Zamanlayıcılar:** `nextDeadline` → DO alarm; alarmda `tick`. Erken/geç alarm güvenli.
5. **Kalıcılık ve kurtarma:** motor durumu DO SQLite deposunda; DO yeniden başlarsa `restore` komutu (spesifikasyon 12.4).
6. **Bağlantı durumu:** bağlanma/kopma → `connection` komutu. Aynı katılımcı için yeni bağlantı eskisini `superseded` ile kapatır.
7. **Katılım:** M2a'daki `join` ucu artık DO'ya motor `join` komutunu iletir; takma ad benzersizliği ve rol kuralları motordan gelir. Tarayıcı başına tek kimlik (token yeniden kullanılır).
8. **Cihaz devri (spesifikasyon 5.5):** `takeover` isteği → yöneticiye bekleyen onay; onaylanınca yeni token eski katılımcı kimliğine bağlanır, eski bağlantı kapanır.
9. **Ortak ekran eşleştirme:** yönetici "eşleştir" → 6 haneli, tek kullanımlık, 5 dk geçerli kod; `POST /api/display/pair` → ekran token'ı; aynı anda tek ekran (yenisi eskisini düşürür).
10. **Hak düşürme:** motor `sessionStarted` olayı → `game_sessions` ve işletme hakkı güncellenir (sınırsız hak hariç).
11. **Bitiş:** oyun bitince rapor (`session_reports`) ve denetim kaydı yazılır; motorun özel medya temizliği sonrası kabuk tarafındaki silme işleri için kanca bırak (fiziksel silme M6).
12. **Rövanş:** yönetici komutu → aynı oda kodunda yeni oturum (hak kuralları geçerli), bağlı katılımcılar yeni lobiye taşınır.
13. **Durum havuzu:** `ctx.prompts` için aktif platform + işletme durumlarını D1'den yükle; makul aralıkla tazele (admin engeli hızlı yansısın).

## Kapsam dışı
Web arayüzü, medya yükleme/YouTube doğrulama (M6), admin paneli. Motor davranışı değişikliği (gerekiyorsa `SPEC-QUESTION` ile sor). Uzak Cloudflare işlemleri. `docs/` değişikliği.

## Bitti tanımı
- Workers yerel test ortamında WebSocket testleri: lobi → katılım → başlatma (hak düşer) → seçim → gösterim → puanlama → sonuç → oyun sonu, eleme ve lig modlarıyla en az birer tam oyun; yetkisiz komut reddi; idempotent tekrar; alarm ile aşama geçişi; DO yeniden başlatılınca devam; yeniden bağlanma ve `superseded`; cihaz devri; ortak ekran eşleştirme; katılımcıya sızıntı olmadığı (gönderen gizli).
- `pnpm verify` geçer.
- Git'e yazamıyorsan commit atma; değişiklikleri bırak. Push yok.

## Teslim
Kısa özet, açık sorular.
