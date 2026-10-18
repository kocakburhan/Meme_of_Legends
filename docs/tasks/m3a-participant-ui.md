# Görev: M3a — Tema ve katılımcı ekranları (sahte verilerle)

Worker: OpenCode (glm-5.3-flash, max) · Dal: `m3a-web`

## Oku
AGENTS.md · docs/PRODUCT_SPEC.md (Bölüm 5, 7, 8.3, 13, 16A, 18) · docs/PROJECT_LOG.md Bölüm 3.1 ve 3.5 · packages/engine/src/types.ts (`View`, `Phase`, `SubmissionView` tipleri)

## Amaç
`apps/web` içinde "Gece Şovu" temasını ve katılımcı (telefon) ekranlarını, ağ bağlantısı olmadan, motorun `View` tipine uyan **sahte verilerle** oluşturmak. Ekranlar daha sonra (M3b) gerçek WebSocket verisine bağlanacak; bu yüzden her ekran yalnız bir `View` nesnesi ve geri çağrımlar (callback) alan saf bileşen olmalı.

## Tema ("Gece Şovu")
- Koyu zemin `#121018`, yüzey `#1E1B26`, metin `#F5F2EA`, vurgu sarı `#FFD23F` (üstünde koyu metin). Tailwind + CSS değişkenleri (anlamsal isimler: background, surface, foreground, accent…). Kontrast WCAG AA.
- Yazı tipleri: Anton (büyük harf başlık, rakam, süre) + Manrope (metin).
- Meme'ler koyu çerçeve içinde; renk süre, durum, seçili puan ve önemli geri bildirimde yoğunlaşır. Gradyan yığını, mor tonlar, ağır gölge yok.
- Ton: oyun anlarında esprili ("Oy ver, kaçma.", "Pişmanlık serbest." vb., spesifikasyon 16A.2); form etiketleri ve hatalar net.
- Hareket: seçim onayında kısa "pop", son karar saniyelerinde yavaş nabız, `prefers-reduced-motion` desteği.

## Ekranlar (390×844 telefon öncelikli, 320 px'e kadar çalışmalı)
1. **Katılım:** oda kodu + işletme adı; takma ad alanı (2–20 karakter); altında kısa bilgilendirme satırı ve aydınlatma metni linki; Oyuncu / Seyirci seçim kartları (oyun başladıysa oyuncu kartı pasif); "Odaya gir".
2. **Lobi:** "Hazırsın, <ad>"; mod ve tahmini süre; oyuncu listesi; seyirci sayısı; kısa "Nasıl oynanır?"; "Linki paylaş".
3. **Seçim (oyuncu):** üstte sabit durum metni + süre + (düelloda) rakip adı; Kütüphane / Yükle / YouTube sekmeleri; arama, kategori çipleri, iki sütun meme ızgarası; seçili meme ve "Seçimimi onayla"; "Süre dolarsa bu gönderilir" bilgisi. Yükle ve YouTube sekmeleri yalnız görsel iskelet (işlevi M6).
4. **Seçim (seyirci / gönderi yapmayan):** durum, eşleşmeler ve canlı "hazır" işaretleri, "5/7 hazır" çubuğu, "Kütüphaneye göz at".
5. **Gösterim ve puanlama:** "Gönderi 3 / 8", ilerleme, durum, büyük anonim gönderi alanı, "Sesi aç" düğmesi, 1–5 büyük düğmeler (tek dokunuş, değiştirilebilir), "son karar" vurgusu; kendi gönderin / rakibinin gönderisi için kilitli durum.
6. **Final gözden geçirme:** gönderi listesi, her birinde küçük 1–5 düğmeleri, puanlanmamışlar vurgulu, kilitli olanlar soluk, "Bitirdim".
7. **Tur sonucu:** sırayla açıklanan düellolar / puanlar (isim, ortalama 2 ondalık, oy sayısı, "Tur atladı" / "Elendi → jüri"), bay satırı, sonraki tura geri sayım; lig/hibrit için tablo görünümü.
8. **Oyun sonu:** şampiyon, kürsü (1-2-3), jüri ödülleri, tam sıralama, "Yönetici rövanş açarsa buradan devam edersin".
9. **Durum ekranları:** duraklatıldı, yeniden bağlanıyor, "Devam ediyoruz 3-2-1", odadan atıldın, takma adını değiştir, elendin/jüriye geçtin, bay geçtin, uzatma turu, kura.

## Yapı
- Yönlendirme iskeleti: `/` (kod girişi), `/oda/:code` (katılımcı), `/ekran`, `/konsol`, `/isletme`, `/admin` (son dördü şimdilik boş yer tutucu). Rota bazlı kod bölme.
- **Geliştirici önizleme sayfası** (`/dev/onizleme`, yalnız geliştirme modunda): her ekranı ve durumunu sahte `View` verileriyle seçip görmeyi sağlar.
- Erişilebilirlik: gerçek `<button>`/`<label>`, görünür odak, 44 px dokunma hedefleri, canlı bölge duyuruları.

## Kapsam dışı
Ağ/WebSocket, sunucu, ortak ekran ve konsol içerikleri, yükleme/YouTube işlevi. `packages/engine`, `apps/server`, `docs/` değişikliği.

## Bitti tanımı
- Tüm ekranlar önizleme sayfasından açılabilir ve 320–430 px genişlikte bozulmaz.
- Ekran bileşenleri için birkaç bileşen testi (ör. puan seçimi geri çağrımı, kilitli durum).
- `pnpm verify` geçer.
- Değişiklikleri `m3a-web` dalında mantıklı commit'ler halinde commit'le. Push yok.

## Teslim
Kısa özet: ekran listesi, eklenen bağımlılıklar, açık sorular.
