# @mol/loadtest

Node 22+ CLI; gerçek HTTP katılımı ve WebSocket komutları ile aynı odada oyun oynatır.
Oyuncular sistem görseli seçip onaylar, uygun katılımcılar 1–5 puan verir ve gözden
geçirmede bitirir. Sunucunun gerçek alarm süreleri kullanılır; 16 oyuncu ve iki tur
birkaç dakika sürebilir. HTTP katılımı sekiz işçi ile sınırlıdır; oyun sırasında tüm
katılımcı bağlantıları eşzamanlı açıktır.

## Yerel hazırlık

Depo kökünde `pnpm install` çalıştırın. Yeni yerel veritabanında:

```sh
export MOL_ADMIN_USERNAME=loadadmin
export MOL_ADMIN_PASSWORD='local-loadtest-password'
pnpm --filter @mol/engine build
pnpm --filter @mol/shared build
pnpm --filter @mol/loadtest prepare:local
pnpm --filter @mol/server dev
```

Yardımcı yalnız yerel migration çalıştırır, yoksa `.dev.vars` oluşturur, test durum
metnini ekler ve admin oluşturur. Mevcut admin hesabını değiştirmez; bu durumda
`admin:create` adımı hata verir, mevcut admin bilgileriyle devam edin.
CLI admin girişi yapar, benzersiz bir işletme ve bir kredili lobi oluşturur.
Yerel test verileri saklanır. Araç sunucu açmaz; Wrangler'ı sonunda Ctrl-C ile kapatın.

Başka terminalde aynı admin ortam değişkenleriyle:

```sh
pnpm --filter @mol/loadtest start -- --url http://127.0.0.1:8787 --players 4 --voters 46 --mode league --rounds 1 --report /tmp/mol-loadtest-50.json
pnpm --filter @mol/loadtest start -- --url http://127.0.0.1:8787 --players 16 --voters 284 --mode league --rounds 2 --report /tmp/mol-loadtest-300.json
```

## Mevcut oda

```sh
export MOL_BUSINESS_USERNAME=...
export MOL_BUSINESS_PASSWORD=...
pnpm --filter @mol/loadtest start -- --url https://sunucu.example --room ABC234 --players 16 --voters 284 --report /tmp/sonuc.json
```

Oda lobide, katılım onaysız ve seyirci kabulü açık olmalıdır. Mevcut odanın ayarları
korunur; `--mode` ve `--rounds` yalnız yeni lobi oluştururken uygulanır. Başlatma
normal oyun kredisi tüketir. Uzak kaynak hazırlığı yapılmaz. `--meme-id` ile sistem
görseli kimliği verilebilir; varsayılan `loadtest-image` medya indirmez. Bu test
medya/CDN trafiğini veya tarayıcı çizim performansını ölçmez.

`--timeout` toplam süre sınırı (saniye, varsayılan 1200), `--reconnect-rate` her
katılımcı için yaklaşık beş saniyelik aralıkta rastgele kopma olasılığıdır
(varsayılan 0.05; kapatmak için 0). Yeniden bağlantı aynı token ile üstel bekleme
ve rastgele gecikme kullanır. SIGINT/SIGTERM bağlantıları kapatıp raporu yazar.

Tablo ve JSON; bağlantı sürelerini, ACK p50/p95/p99/maksimumunu, hata nedenlerini,
planlı/toplam kopmaları ve yeniden bağlantıları içerir. ACK süresi monoton yerel
saatle ölçülür. Aşama anahtarı tüm `view.phase` alanlarını içerir (tur, sunum
indeksi ve açıklama adımı dahil). Aynı aşamanın istemci başına ilk teslimi alınır;
ilk bağlantı ve yeniden bağlantı anlık görüntüleri ölçüme girmez. Yerel teslim
saatleri arasındaki fark ve aynı mesajlardaki `serverNow` farkı ayrı raporlanır.
Bunlar tek yük üreteci üzerindeki saatlerdir; ağların saat eşitleme doğrulaması
değildir. `completeTransitions` tüm beklenen bağlantıların gördüğü aşama sayısıdır;
kopan istemciler nedeniyle eksik örnekler ayrıca görülebilir.

Çıkış kodu: oyun tamamlanmazsa, hata olursa veya herhangi bir ACK/yerel aşama farkı
1000 ms'yi aşarsa 1. Performans hedefi ihlali rapor üretimini engellemez.
Kimlik bilgileri ve token'lar rapora yazılmaz. Rapor yolunun dizini mevcut olmalıdır.

## Yerel doğrulama sonucu

`results/local-50.json`: 4 oyuncu + 46 seyirci, lig / 1 tur; oyun tamamlandı,
222 komut onayı, hata yok, 37 planlı kapatma isteği, 29 gözlenen kopma ve
28 yeniden bağlantı denemesi (oyun bitişinde bekleyen işlemler kapatıldı). ACK p50/p95/p99: 269/767/868 ms,
maksimum 891 ms. Aşama teslim farkı p95/maksimum: 23/23 ms; `serverNow`
farkı p95/maksimum: 27/27 ms. Bağlantı p95: 452 ms. Bunlar yerel geliştirme
ortamı ölçümleridir; 300 kişi veya üretim kapasitesi doğrulaması değildir.

Önceki, yerel testlerle eşzamanlı koşuda Wrangler runtime çökmesi ve yeniden
bağlantı hataları gözlendi. Sunucu/motor değiştirilmedi; yukarıdaki sonuç test
süreçleri kapandıktan sonra yeniden açılan Wrangler oturumundan alındı.
