import { expect, test } from '@playwright/test';
import { createBusinessAndLobby, SERVER, WEB } from '../helpers/driver';
import { E2E_ADMIN } from '../global-setup';

/**
 * M5c-1 uçtan uca: medya ucundan tohum meme dosyaları; admin girişi (yanlış
 * şifre, oturum yokken ?next=), genel bakış bölümleri (az durum uyarısı,
 * aktif oturumlar), işletme listesi/filtresi, kısa formla işletme açma →
 * giriş bilgisi özeti + kopyala, detayda hak ekle/çıkar, şifre sıfırlama
 * (onaylı), adına girişle işletme panelinin yeni sekmede açılması; telefon
 * ve masaüstü düzeni.
 */

test.describe.configure({ mode: 'serial' });

test('medya: tohum meme dosyaları /media ucundan sunulur', async ({ request }) => {
  const png = await request.get(`${SERVER}/media/memes/m-e2e-0/media.png`);
  expect(png.ok()).toBe(true);
  expect(png.headers()['content-type']).toBe('image/png');
  const gif = await request.get(`${SERVER}/media/memes/m-e2e-2/media.gif`);
  expect(gif.ok()).toBe(true);
  expect(gif.headers()['content-type']).toBe('image/gif');
});

test('admin: giriş → genel bakış → işletme aç → kopyala → hak ekle → adına giriş', async ({
  browser,
}) => {
  // Genel bakışta görünen aktif oturum: API ile işletme + lobi.
  const lobby = await createBusinessAndLobby({});

  const context = await browser.newContext();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB });
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 390, height: 844 });

    // Oturum yokken /admin → ?next= ile girişe.
    await page.goto(`${WEB}/admin`);
    await expect(page).toHaveURL(/\/admin\/giris\?next=%2Fadmin$/);

    // Yanlış şifre anlaşılır hata verir.
    await page.getByLabel('Kullanıcı adı').fill(E2E_ADMIN.username);
    await page.getByLabel('Şifre').fill('yanlis-admin-sifresi');
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page.getByRole('alert')).toHaveText('Kullanıcı adı ya da şifre hatalı.');

    // Doğru giriş → genel bakış.
    await page.getByLabel('Şifre').fill(E2E_ADMIN.password);
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Genel bakış' })).toBeVisible();

    // Az platform durumu uyarısı (tohumda 6 aktif durum < 30 eşiği).
    await expect(page.getByRole('note', { name: 'Platform durumu sayısı' })).toContainText(
      'Platform durumları az: 6',
    );

    // Aktif oturum listesi: API ile açılan lobi, işletme adıyla görünür.
    const sessionRow = page.getByRole('listitem').filter({ hasText: `Oda ${lobby.code}` });
    await expect(sessionRow).toBeVisible();
    await expect(sessionRow).toContainText('Anka Kafe');
    await expect(sessionRow).toContainText('Lobi');

    // Etiketlenmemiş kuyruk boş (tohum meme'leri etiketli).
    await expect(page.getByText('Etiketlenmemiş meme yok.')).toBeVisible();

    // Oturum satırı detaya gider (detay M5c-3'te; yer tutucu bilgi verir).
    await sessionRow.getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/admin/oturumlar/${lobby.sessionId}$`));
    await expect(page.getByText('Bu bölüm M5c-3 oturumunda eklenecek.')).toBeVisible();

    // Telefon menüsü: üst çubuktan açılır, seçince kapanır.
    await page.getByRole('button', { name: 'Menü' }).click();
    await page
      .getByRole('navigation', { name: 'Admin menü' })
      .getByRole('link', { name: 'İşletmeler' })
      .click();
    await expect(page).toHaveURL(/\/admin\/isletmeler$/);
    await expect(page.getByRole('navigation', { name: 'Admin menü' })).toBeHidden();

    // Liste: API ile açılan işletme görünür; pasif filtresi boş not verir.
    await expect(page.getByRole('listitem').filter({ hasText: 'Anka Kafe' }).first()).toBeVisible();
    await page.getByRole('radio', { name: 'Pasif' }).click();
    await expect(page.getByText('Pasif işletme yok.')).toBeVisible();
    await page.getByRole('radio', { name: 'Tümü' }).click();

    // Kısa formla işletme açma: önerilen şifre gelir ve değiştirilebilir.
    const username = `e2e-kafe-${crypto.randomUUID().slice(0, 8)}`;
    await page.getByRole('button', { name: 'İşletme Oluştur' }).click();
    await page.getByLabel('İşletme adı').fill('E2E Kafe');
    await page.getByLabel('Kullanıcı adı').fill(username);
    await page.getByLabel('Başlangıç hakkı').fill('3');
    const suggested = await page.getByLabel('Önerilen şifre').inputValue();
    expect(suggested.length).toBeGreaterThanOrEqual(12);
    await page.getByRole('button', { name: 'Oluştur' }).click();

    // Giriş bilgisi özeti + kopyala (pano içeriği özetle aynı).
    const summary = page.getByRole('note', { name: 'Giriş bilgileri' });
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(`Kullanıcı adı: ${username}`);
    await expect(summary).toContainText('Geçici şifre: ');
    const summaryText = (await summary.getByTestId('credentials-summary').textContent()) ?? '';
    expect(summaryText.length).toBeGreaterThan(0);
    await summary.getByRole('button', { name: 'Kopyala' }).click();
    await expect(summary.getByRole('button', { name: 'Kopyalandı' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(summaryText);

    // Detay: ad, başlangıç hakkı ve boş kullanım özeti.
    await summary.getByRole('link', { name: 'İşletmeye git' }).click();
    await expect(page).toHaveURL(/\/admin\/isletmeler\/[a-f0-9-]{36}$/);
    await expect(page.getByRole('heading', { name: 'E2E Kafe' })).toBeVisible();
    await expect(page.getByText('Oyun hakkı: 3')).toBeVisible();
    await expect(page.getByText('Toplam oturum: 0')).toBeVisible();

    // Hak ekle / çıkar; sunucu güncel bakiyeyi döner.
    await page.getByLabel('Hak miktarı').fill('2');
    await page.getByRole('button', { name: 'Hak ekle' }).click();
    await expect(page.getByText('Oyun hakkı: 5')).toBeVisible();
    await page.getByLabel('Hak miktarı').fill('1');
    await page.getByRole('button', { name: 'Hak çıkar' }).click();
    await expect(page.getByText('Oyun hakkı: 4')).toBeVisible();

    // Negatif bakiye sunucudan 409 döner; anlaşılır hata gösterilir.
    await page.getByLabel('Hak miktarı').fill('999');
    await page.getByRole('button', { name: 'Hak çıkar' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Bakiye negatif olamaz; çıkarılacak hak kalmadı.',
    );

    // Şifre sıfırla (onaylı) → yeni geçici şifre + kopyala.
    await page.getByRole('button', { name: 'Şifre sıfırla' }).click();
    await page.getByRole('button', { name: 'Evet, şifreyi sıfırla' }).click();
    const resetNote = page.getByRole('note', { name: 'Yeni geçici şifre' });
    await expect(resetNote).toBeVisible();
    const newPassword = (await resetNote.getByTestId('temporary-password').textContent()) ?? '';
    expect(newPassword.length).toBeGreaterThanOrEqual(12);
    await resetNote.getByRole('button', { name: 'Şifreyi kopyala' }).click();
    await expect(resetNote.getByRole('button', { name: 'Kopyalandı' })).toBeVisible();

    // Adına giriş: işletme paneli yeni sekmede açılır, işletme adı görünür.
    const popup = context.waitForEvent('page');
    await page.getByRole('button', { name: 'Adına giriş' }).click();
    const businessPage = await popup;
    await businessPage.waitForURL(/\/isletme$/);
    await expect(businessPage.getByRole('heading', { name: 'E2E Kafe' })).toBeVisible();
    await businessPage.close().catch(() => undefined);

    // Masaüstü: yan menü görünür, üst çubuk gizlenir; menü bölümleri tamdır.
    await page.setViewportSize({ width: 1280, height: 800 });
    const menu = page.getByRole('complementary', { name: 'Admin menü' });
    await expect(menu.getByRole('link', { name: 'Genel bakış' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Oturumlar' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'İçerik' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Menü' })).toBeHidden();
    await menu.getByRole('link', { name: 'Sistem' }).click();
    await expect(page).toHaveURL(/\/admin\/sistem$/);
    await expect(page.getByText('Bu bölüm M5c-3 oturumunda eklenecek.')).toBeVisible();
  } finally {
    await context.close().catch(() => undefined);
  }
});
