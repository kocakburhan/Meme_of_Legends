# Görev: M5a — Admin API'si, meme yükleme ve medya sunumu (sunucu)

Worker: Codex (gpt-6.1-sol, medium) · Dal: `m5a-admin-api`

## Oku
AGENTS.md · docs/PRODUCT_SPEC.md Bölüm 2.1, 3, 6.1–6.3, 12.3, 15, 16 · docs/PROJECT_LOG.md son girdiler (M5 medya kararı) · docs/contracts/db-schema.md · docs/contracts/business-api.md (biçim örneği) · apps/server/src/admin.ts, business.ts, rooms.ts

## Amaç
Admin panelinin (M5c) ve yerel medya aracının (M5b) ihtiyaç duyduğu tüm sunucu uçlarını yazmak; sistem meme'lerinin gerçek medyasını R2'den sunmak.

## Kapsam
1. **Sözleşme:** `docs/contracts/admin-api.md` v0.1'i yaz (business-api.md biçiminde: uç tablosu + TS tipleri). İstek/yanıt şemaları `packages/shared` içinde (`admin.ts`), web aynı şemaları kullanacak. Bu dosya orchestrator onayına tabidir; gerekçesiz tablo eklemesi yapma.
2. **İşletmeler (15.1):** mevcut uçlar kalır. Liste uçlarına arama + aktif/pasif filtresi; detayda kullanım özeti (oturum sayıları, harcanan/iade edilen hak, son oyun). `credentials.loginUrl` yanlış: web giriş rotası `/isletme/giris`.
3. **Kriz araçları (15.2):** herhangi bir aktif oturumu sonlandırma (oda DO'suna mevcut kapatma yolu, `endReason: 'adminTerminated'` benzeri), oturum hakkını iade (bir kez; `game_sessions` bayrağı), **işletme adına giriş**: admin, işletme rolünde kısa ömürlü bir oturum çerezi alır; `admin_actions`'a yazılır. Admin'in kendi oturumu bozulmamalı (ayrı çerez adı ya da web'in yeni sekmede açacağı tek kullanımlık giriş bağlantısı — seçim sende, sözleşmeye yaz).
4. **Raporlar (15.4):** oturum listesi (canlı/geçmiş, işletme/durum/tarih filtresi, imleçli sayfalama), oturum detayı (SPEC 15.4'teki alanlar; `session_reports` ve `session_audit` neyi taşıyorsa; eksik alan için raporu genişletmen gerekiyorsa küçük tut ve özette belirt), işletme bazında kullanım özeti, sistem hata kayıtları (`error_log`) ve admin işlem kaydı (`admin_actions`) listeleri.
5. **Kategoriler:** listele, oluştur, yeniden adlandır, sırala, arşivle/geri al.
6. **Platform durumları (6.2):** listele (arama, durum filtresi, imleç), oluştur, düzenle, arşivle/geri al; tekrar kuralı platform içinde (normalize metin; işletme durumlarıyla aynı `normalizePromptText`, `promptTextSchema`). Aktif platform durumu sayısı ve "az" uyarısı (eşik sunucu sabiti, ör. 30) bir uçta dönsün.
7. **İşletme durumları (6.2):** tüm işletmelerin durumlarını listele (işletme, metin araması, engelli filtresi), engelle / engeli kaldır. Metin düzenlenemez.
8. **Sistem meme'leri:**
   - Liste: arama (açıklama), kategori ve durum (`untagged`/`active`/`archived`) filtresi, imleç. Etiketlenmemiş kuyruğu için "sıradaki etiketlenmemiş" (en eski) kolayca alınabilsin.
   - Güncelle: `categoryId`, `description`, `status`. `active`'e geçiş kategori + boş olmayan açıklama ister.
   - **Yükleme (yerel araç bu uca bağlanır — biçim SABİT, değiştirme):**
     `POST /api/admin/memes` — `multipart/form-data`, admin çerezi:
     - `file`: ana medya (resim: jpeg/png/webp; gif; video: mp4 H.264/AAC). Boyut sınırı sunucu sabiti (ör. 50 MB).
     - `cover`: isteğe bağlı jpeg/webp (video için kapak).
     - `meta`: JSON `{ mediaType: 'image'|'gif'|'video', durationMs?: number, sourceUrl?: string, categoryId?: string, description?: string }`.
     - `201 { meme }`. Kategori ve açıklama birlikte verildiyse `status: 'active'`, değilse `'untagged'`.
     - `409 { error: { code: 'MEME_DUPLICATE', existingId } }` aynı `sourceUrl` zaten varsa (arşivli dahil).
     - `422 MEDIA_INVALID` (tür/boyut/içerik türü uyuşmazlığı; video `durationMs` > 25 000 ise de).
     - R2 anahtarları `memes/<id>/media.<ext>` ve `memes/<id>/cover.<ext>`.
   - `GET /api/admin/memes/check?sourceUrl=` → `{ existingId: string | null }` (araç indirmeden önce mükerrer kontrolü yapar).
9. **Medya sunumu:** `GET /media/<r2Key>` R2'den; doğru `content-type`, uzun önbellek (`immutable`, anahtar içerikle değişmez), **Range desteği** (video Safari'de bunsuz oynamaz), ETag. Yalnız `memes/` öneki sunulur (özel içerik M6'da ayrıca ele alınır). Kütüphane ucu (`rooms.ts` libraryRoute) her meme için `mediaUrl` ve varsa `coverUrl` (+ `durationMs`) dönsün; şema `packages/shared`'da güncellenir, eski alanlar kalır. Web'deki `MemeFrame` gerçek `src` almıyorsa küçük bağlama değişikliği (`src` = `mediaUrl`, video için `<video>` + kapak) bu görevin kapsamındadır; başka web değişikliği yapma.
10. Tüm admin yazma işlemleri `admin_actions`'a kaydedilir.

## Kapsam dışı
Admin paneli web arayüzü (M5c). Yerel medya aracı (M5b, başka worker `tools/media` üzerinde çalışıyor; dokunma). Özel içerik (M6). Uzak Cloudflare işlemleri. Motor değişikliği.

## Bitti tanımı
- Her uç için sunucu testleri (yetki: işletme çerezi ve çerezsiz istek `401/403`; doğrulama; mükerrer; iade bir kez; adına giriş kaydı; Range yanıtı `206`).
- `pnpm verify` geçer; mevcut e2e (`pnpm --filter @mol/e2e test:e2e`) bozulmaz. e2e/yerel sunucu 8787/5173 portlarını kullanır; başka iş çalışmıyorsa kullanabilirsin, açtığın süreçleri kapat.
- Şema değişikliği gerekiyorsa Drizzle migration ile, özette gerekçesiyle.
- Commit at; push yok.

## Teslim
Kısa özet: uçlar, sözleşme dosyası, şema/migration değişiklikleri, açık sorular (CONTRACT-QUESTION / SPEC-QUESTION).
