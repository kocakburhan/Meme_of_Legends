import { expect, test } from '@playwright/test';
import { createBusiness, SERVER, WEB } from '../helpers/driver';

/**
 * M4c-2 uçtan uca: Durumlarım — boş liste; canlı sayaç; geçersiz metin (link,
 * kısa); ekleme; tekrar reddi (aktif ve arşivli çakışmada "Yeniden
 * etkinleştir" önerisi); arşivle / geri getir; arama; "daha fazla"
 * sayfalama; masaüstünde yan menü.
 */

test.describe.configure({ mode: 'serial' });

const TEXT = 'E2E durum: makine öğrendi ama kahve söylemedi';
const TEXT2 = 'E2E durum: pazartesi yine geldi';

test('durumlar: ekle → tekrar → arşivle → geri getir → ara → sayfala', async ({ browser }) => {
  const business = await createBusiness();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(`${WEB}/isletme/giris`);
    await page.getByLabel('Kullanıcı adı').fill(business.username);
    await page.getByLabel('Şifre').fill(business.password);
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page).toHaveURL(/\/isletme$/);

    await page.getByRole('link', { name: 'Durumlarım' }).click();
    await expect(page).toHaveURL(/\/isletme\/durumlar$/);
    await expect(page.getByText('Henüz durum yok; yukarıdan ekle.')).toBeVisible();

    const input = page.getByLabel('Yeni durum');
    const rowFor = (text: string) => page.getByRole('listitem').filter({ hasText: text });

    // Canlı sayaç.
    await input.fill('Merhaba');
    await expect(page.getByText('7/160')).toBeVisible();

    // Geçersiz metin: link reddedilir, ipucu görünür; ağ çağrısı bile gerekmez.
    await input.fill('bakın https://ornek.com');
    await page.getByRole('button', { name: 'Ekle' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Durum 3–160 karakter olmalı; link ve HTML kabul edilmez.',
    );
    await expect(page.getByText('İpucu: Nokta sonrası boşluk bırak.')).toBeVisible();

    // Kısa metin de geçersiz.
    await input.fill('ab');
    await page.getByRole('button', { name: 'Ekle' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Durum 3–160 karakter olmalı; link ve HTML kabul edilmez.',
    );

    // Ekleme; liste tazelenir.
    await input.fill(TEXT);
    await page.getByRole('button', { name: 'Ekle' }).click();
    await expect(rowFor(TEXT)).toBeVisible();

    // Tekrar: büyük/küçük harf ve boşluklar normalize edilir; aktif çakışmada
    // düğme önerilmez.
    await input.fill(`  ${TEXT.toLocaleUpperCase('tr-TR')}  `);
    await page.getByRole('button', { name: 'Ekle' }).click();
    await expect(page.getByRole('alert')).toHaveText('Bu durum zaten var.');
    await expect(page.getByRole('button', { name: 'Yeniden etkinleştir' })).toHaveCount(0);

    // İkinci durum (arama testi için).
    await input.fill(TEXT2);
    await page.getByRole('button', { name: 'Ekle' }).click();
    await expect(rowFor(TEXT2)).toBeVisible();

    // Arşivle: aktif listeden düşer, diğer kalır.
    await rowFor(TEXT).getByRole('button', { name: 'Arşivle' }).click();
    await expect(rowFor(TEXT)).toBeHidden();
    await expect(rowFor(TEXT2)).toBeVisible();

    // Arşiv filtresi: kayıt orada; geri getir.
    await page.getByRole('radio', { name: 'Arşiv' }).click();
    await expect(rowFor(TEXT)).toBeVisible();
    await rowFor(TEXT).getByRole('button', { name: 'Yeniden etkinleştir' }).click();
    await expect(page.getByText('Arşivde durum yok.')).toBeVisible();

    // Arşivli çakışma: yeniden arşivle, aynı metni eklemeyi dene → düğme önerisi.
    await page.getByRole('radio', { name: 'Aktif' }).click();
    await expect(rowFor(TEXT)).toBeVisible();
    await rowFor(TEXT).getByRole('button', { name: 'Arşivle' }).click();
    await expect(rowFor(TEXT)).toBeHidden();
    await input.fill(TEXT);
    await page.getByRole('button', { name: 'Ekle' }).click();
    await expect(page.getByRole('alert')).toHaveText('Bu durum zaten var.');
    await page.getByRole('button', { name: 'Yeniden etkinleştir' }).click();
    await expect(rowFor(TEXT)).toBeVisible();

    // Arama: yalnız eşleşen kalır; boş sonuçta anlaşılır not; Temizle listinge döner.
    const search = page.getByRole('textbox', { name: 'Ara' });
    await search.fill('pazartesi');
    await page.getByRole('button', { name: 'Ara' }).click();
    await expect(rowFor(TEXT2)).toBeVisible();
    await expect(rowFor(TEXT)).toBeHidden();
    await search.fill('zzzz');
    await page.getByRole('button', { name: 'Ara' }).click();
    await expect(page.getByText('Aramanla eşleşen durum yok.')).toBeVisible();

    // Sayfalama: API ile 49 durum daha; hepsi "durum" kelimesini taşıdığı için
    // arama listeyi doldurur → ilk sayfa 50 satır, "daha fazla" kalanı ekler.
    for (let i = 0; i < 49; i++) {
      const res = await fetch(`${SERVER}/api/business/prompts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: business.cookie },
        body: JSON.stringify({ text: `Toplu durum ${i}: hafızasız iş gücü` }),
      });
      if (!res.ok) throw new Error(`prompt seed → ${res.status} ${await res.text()}`);
    }
    await search.fill('durum');
    await page.getByRole('button', { name: 'Ara' }).click();
    await expect(page.getByRole('listitem')).toHaveCount(50);
    await page.getByRole('button', { name: 'Daha fazla' }).click();
    await expect(page.getByRole('listitem')).toHaveCount(51);
    await expect(page.getByRole('button', { name: 'Daha fazla' })).toBeHidden();

    // Masaüstünde yan menü görünür, alt gezinme gizlenir.
    await page.setViewportSize({ width: 1280, height: 800 });
    const menu = page.getByRole('complementary', { name: 'Panel menü' });
    await expect(menu.getByRole('link', { name: 'Durumlarım' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Panel menü' })).toBeHidden();
  } finally {
    await context.close().catch(() => undefined);
  }
});
