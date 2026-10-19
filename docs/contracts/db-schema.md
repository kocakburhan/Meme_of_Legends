# Sözleşme: Veritabanı Şeması (D1, `apps/server`)

- **Sürüm:** v0.1 taslak (orchestrator, 2026-10-18)
- Kesin kolonlar Drizzle şemasında tanımlanır; bu doküman tabloları ve sorumlulukları sabitler. Tablo ekleme/çıkarma orchestrator onayıyla.
- **Sınır:** Süren oyunun canlı durumu D1'de değil, odanın Durable Object deposundadır. D1 kalıcı iş verisini, raporları ve içeriği tutar.

| Tablo | İçerik |
|---|---|
| `admin_account` | Tek admin hesabı (kullanıcı adı, PBKDF2 şifre özeti). Komutla oluşturulur. |
| `businesses` | İşletme: ad, benzersiz kullanıcı adı, şifre özeti, durum (aktif/pasif), hak sayısı, sınırsız hak bayrağı, eşzamanlı oturum sınırı, lobi ömrü (saat), oluşturulma. |
| `auth_sessions` | Giriş oturumları (admin / işletme): kimlik, sahip, oluşturulma, son kullanma, iptal. Şifre değişiminde/sıfırlamada toplu iptal. |
| `game_sessions` | Oyun oturumu: işletme, oda kodu, durum (lobi/oyun/bitti/iptal/sonlandırıldı), mod ve ayarlar, oluşturulma/başlama/bitiş, bitiş nedeni, başlatma/hak işareti (`credit_consumed`), gerçek bakiye düşümü (`credit_charged`, M5 öncesinde bilinmiyorsa null), hak iade edildi mi, admin müdahale bayrakları. |
| `session_reports` | Oyun bitince yazılan rapor özeti (JSON): turlar, oynanan durum metinleri, kullanılan sistem meme'leri, özel içerik türleri, oy sayıları ve ortalamalar, sonuçlar, sıralama, çıkarmalar, gizlemeler, duraklatmalar, hatalar. Takma adlar 7 gün sonra anonimleştirilir. |
| `session_audit` | Oturum denetim kaydı (zaman, tür, yük). |
| `categories` | Meme kategorileri (ad, sıra, arşiv). |
| `memes` | Sistem meme'i: kategori, açıklama, medya tipi, R2 anahtarı, kapak anahtarı, süre, kaynak link, durum (`untagged` / `active` / `archived`), oluşturulma. |
| `media_jobs` | Medya işleri: tür (link / toplu), girdi, durum, hata, ilişkili meme. |
| `prompts` | Durumlar: sahip türü (platform / işletme), işletme, metin, normalize metin (işletme içi tekrar kontrolü), durum (aktif / arşiv), admin engeli, zaman damgaları. |
| `custom_uploads` | Oyuncu yüklemeleri: oturum, R2 anahtarı, oluşturulma, silinme (oturum sonunda silinir). |
| `admin_actions` | Admin işlem kaydı: zaman, işlem (hak değişimi, iade, sonlandırma, adına giriş, engelleme…), hedef, ayrıntı. |
| `error_log` | Sistem ve medya hataları (admin raporu için). |

M6a (`0003_unique_rattler.sql`): `custom_uploads` satırlarına `participant_id` ve `media_type` (`image`/`gif`) eklenir. Yeni yüklemeler bu alanları doldurur; seçimde sahiplik/oturum/tür birlikte kontrol edilir. Eski satırlar için alanlar nullable'dır. Oturum sonunda satır fiziksel olarak silinir; `deleted_at` geçmiş alanı kullanılmaz. Ayrıntılar [custom-content.md](custom-content.md).
