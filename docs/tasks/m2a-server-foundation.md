# Görev: M2a — Sunucu temeli (protokol, veritabanı, kimlik, oturum açma)

Worker: Codex (gpt-6.1-sol, medium) · Dal: `m2a-server`

## Oku
AGENTS.md · docs/PRODUCT_SPEC.md (Bölüm 2–5, 14.4, 15) · docs/contracts/protocol.md · docs/contracts/db-schema.md · docs/contracts/engine-api.md · packages/engine/README.md

## Amaç
Oyun odası (Durable Object) hariç sunucunun temelini kurmak: ortak protokol tipleri, D1 şeması, kimlik doğrulama, işletmenin lobi açması ve katılımcının odaya katılması.

## Kapsam
1. **`packages/shared`:** protokol sözleşmesindeki mesaj tipleri ve doğrulama şemaları (ör. zod). Motorun `Command`/`View` tiplerini `@mol/engine`'den yeniden kullan; rol bazlı izinli komut alt kümeleri (katılımcı / yönetici).
2. **D1 şeması:** db-schema sözleşmesindeki tablolar, Drizzle ORM ile; migration dosyaları `apps/server/migrations/`. Yalnız **yerel** D1'e uygula (`wrangler d1 migrations apply mol-db --local`). Uzak veritabanına uygulama.
3. **Kimlik:**
   - PBKDF2 (WebCrypto) şifre özeti.
   - Admin hesabı oluşturma komutu: `pnpm --filter @mol/server admin:create` (kullanıcı adı + şifre; yerel D1'e yazar; uzak için aynı komutun `--remote` seçeneği olsun ama ÇALIŞTIRMA).
   - Admin ve işletme giriş/çıkış, işletme şifre değiştirme (diğer cihazların oturumları kapanır), HttpOnly çerezli oturumlar (`auth_sessions`).
4. **Admin uçları (minimum):** işletme oluşturma (ad, kullanıcı adı, hak sayısı; sistem geçici şifre önerir; yanıt kopyalanabilir giriş özeti içerir), işletme listesi, hak ekle/çıkar, sınırsız hak, pasife alma, şifre sıfırlama (o işletmenin oturumları kapanır). Admin işlemleri `admin_actions` tablosuna yazılır.
5. **İşletme uçları:** kalan hak; lobi oluşturma (spesifikasyon 3.2–3.3 ve 4.2: hakkı 0 ise açamaz, eşzamanlı oturum sınırı, 6 karakterlik karışmayan oda kodu); lobiyi iptal etme.
6. **Katılım uçları:** `GET /api/rooms/:code`, `POST /api/rooms/:code/join` → HMAC imzalı katılımcı token'ı (gizli anahtar `TOKEN_SECRET`, `.dev.vars`; örnek dosya `.dev.vars.example`). Takma ad kuralları (spesifikasyon 5.3) sunucuda da doğrulansın. Katılımın oyun durumuna etkisi (motor `join` komutu) M2b'de Durable Object'e bağlanacak; şimdilik uç token üretip katılımcı kimliğini döndürsün.
7. Hata yanıtları tutarlı JSON biçiminde; arayüze Türkçe gösterilecek mesajlar için hata kodları.

## Kapsam dışı
Oda Durable Object'i, WebSocket, oyun akışı (M2b). Web arayüzü. Medya. Uzak Cloudflare işlemleri (deploy, uzak migration). `docs/` değişikliği. `packages/engine` değişikliği.

## Bitti tanımı
- Workers yerel test ortamında testler: şifre özeti, giriş/çıkış, oturum iptalleri, yetkisiz erişim reddi, işletme oluşturma, hak kuralları, eşzamanlı oturum sınırı, lobi oluşturma/iptal, oda kodu biçimi, katılım ve token doğrulama, takma ad kuralları.
- `pnpm verify` geçer.
- Git'e yazamıyorsan commit atma; değişiklikleri çalışma alanında bırak (orchestrator commit'ler). Push yok.

## Teslim
Kısa özet: yapılanlar, uç listesi, açık sorular (`// SPEC-QUESTION:` ile işaretlenenler dahil).
