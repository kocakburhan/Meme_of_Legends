# Görev: M4b — Yönetici konsolu

Worker: OpenCode (glm-5.3-flash, max) · Dal: `m4b-console`

## Oku
AGENTS.md · docs/contracts/protocol.md (v0.2) · docs/contracts/business-api.md · docs/PRODUCT_SPEC.md Bölüm 4, 6.4, 7, 11, 12, 14, 16A · docs/PROJECT_LOG.md Bölüm 3.3, 3.5 · apps/web/src/net/ (mevcut ağ katmanı) · apps/e2e/helpers/driver.ts

## Amaç
İşletme yöneticisinin oyunu telefondan (ve masaüstünden) yönettiği konsolu yazmak. Bitince bir yönetici giriş yapıp bir lobiyi konsoldan kurup oyunu baştan sona yönetebilmeli.

## Kapsam
1. **Giriş** (`/isletme/giris`): kullanıcı adı + şifre → `POST /api/auth/business/login`. Girişten sonra `?next=` ya da `/isletme`'ye (panel M4c'de; şimdilik basit bir yer tutucu sayfa: "Panel yakında" + aktif oturum kodunu girip konsola gitme kutusu).
2. **Konsol** (`/isletme/oyun/:code`): yönetici WebSocket'i (çerezle) + `ManagerShellInfo`. PROJECT_LOG 3.3'teki yapı:
   - Üstte sabit durum çubuğu: aşama, tur, kalan süre, büyük Duraklat/Devam, ortak ekran menüsü (eşleştirme kodu üret/göster, bağlı mı).
   - **Oyun** sekmesi, aşamaya göre tek kart:
     - lobi: mod ve ayarlar (SPEC 4.3 tablosu, sınırlar ve açıklamalar), tahmini süre (`estimateDuration`), ilk durum önizlemesi + Değiştir, katılım linkini kopyala, QR göster/indir, Başlat ("1 oyun hakkın düşecek, kalan: N" onayı, koşullar sağlanmazsa pasif + neden), Lobiyi iptal et.
     - seçim: özel içerik canlı listesi + Reddet, +15/+30/+60, ilk 15 sn'de Durumu değiştir, hazır sayısı.
     - gösterim: mevcut gönderi + gönderen, oy sayacı, **Hemen gizle (1 sn basılı tutma, düğme dolarak ilerler)**.
     - final gözden geçirme: bitiren sayısı (View'de `review` alanı M4a ile gelecek; alan yoksa göstermeden çalış), Şimdi kapat.
     - sonuç: sonraki durum önizlemesi + Değiştir, Beklet (duraklat) / Hemen geç.
     - oyun sonu: Rövanş.
   - **Katılımcılar** sekmesi: oyuncu/seyirci listeleri, kişi başına işlemler (seyirciye al, at [onaylı], takma adı sıfırla), bekleyen onaylar ve cihaz devri istekleri (rozetli; asla engelleyici pencere değil).
   - **Ayarlar** sekmesi: sonraki turlar için süreler, özel içerik, seyirci kabulü, onay modları, Oyunu bitir (onaylı).
   - Geri alınamaz işlemler onay ister. Masaüstünde bölümler yan yana sütunlar.
   - Komut sonuçları `ack` ile; reddedilen komutta anlaşılır Türkçe mesaj (motor ret nedenlerini insan diline çeviren tek bir eşleme).
3. Görsel dil: Gece Şovu (mevcut token'lar); konsol oyun yüzeyidir ama araç gibi sade ve okunaklı olmalı. Telefon (360–430 px) öncelikli.
4. **E2E (Playwright):** API ile işletme + lobi oluştur, arayüzden giriş yap, konsoldan ayar değiştir, ekran eşleştir, katılımcılar (tarayıcı bağlamları) katılsın, konsoldan başlat, bir gönderiyi Hemen gizle ile gizle, oyunu bitir ve rövanş aç. Mevcut 3 e2e testi geçmeye devam eder.

## Kapsam dışı
İşletme paneli sayfaları (ana sayfa, Durumlarım, Geçmiş, Hesap — M4c). Sunucu/motor/shared değişikliği (başka worker'da; ihtiyaç olursa özetinde yaz). Uzak Cloudflare. `docs/`.

## Bitti tanımı
- `pnpm verify` ve `pnpm --filter @mol/e2e test:e2e` geçer.
- 360×740, 390×844 ve 1280×800'de düzen bozulmaz.
- Dalda mantıklı commit'ler. Push yok. Arkada süreç bırakma. Elle tarayıcı/MCP keşfini en aza indir; asla çözülmeyen beklemeler kullanma.

## Teslim
Kısa, doğru özet (uydurma yok), açık sorular.
