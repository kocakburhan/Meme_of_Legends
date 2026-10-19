import { expect, test } from '@playwright/test';
import { createBusiness, WEB } from '../helpers/driver';

/**
 * M4c-1 uçtan uca: işletme paneli — giriş; şifre değiştirme (hatalı mevcut,
 * başarı, "diğer cihazlar" bilgisi, yeni şifreyle giriş); "Yeni oyun" ile
 * ayarsız lobi → konsol; panele dönüş → "Oyuna dön"; konsoldan "Lobiyi
 * iptal et" (oturum kimliği sunucu listesinden bulunur); masaüstünde yan menü.
 */

test.describe.configure({ mode: 'serial' });

const PASSWORD = 'anka-kafe-pass-123';
const NEW_PASSWORD = 'yeni-anka-sifresi-456';

test('panel: giriş → şifre → yeni oyun → konsol → Oyuna dön → lobiyi iptal', async ({ browser }) => {
  const business = await createBusiness({
    username: `anka-${crypto.randomUUID().slice(0, 8)}`,
    password: PASSWORD,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 390, height: 844 });

    // Giriş: next varsayılan /isletme.
    await page.goto(`${WEB}/isletme/giris`);
    await page.getByLabel('Kullanıcı adı').fill(business.username);
    await page.getByLabel('Şifre').fill(business.password);
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page).toHaveURL(/\/isletme$/);
    await expect(page.getByRole('heading', { name: 'Anka Kafe' })).toBeVisible();
    await expect(page.getByText('Oyun hakkı')).toBeVisible();
    await expect(page.getByText('5', { exact: true })).toBeVisible();

    // Şifre değiştir: önce hatalı mevcut şifre, sonra başarı.
    await page.getByRole('link', { name: 'Hesap' }).click();
    await expect(page).toHaveURL(/\/isletme\/hesap$/);
    await page.getByLabel('Mevcut şifre').fill('yanlis-sifre-123');
    await page.getByLabel('Yeni şifre', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Yeni şifre (tekrar)').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Şifreyi değiştir' }).click();
    await expect(page.getByRole('alert')).toHaveText('Mevcut şifren hatalı.');
    await page.getByLabel('Mevcut şifre').fill(PASSWORD);
    await page.getByRole('button', { name: 'Şifreyi değiştir' }).click();
    await expect(page.getByText('Diğer cihazlardaki girişler kapatıldı; bu cihaz açık kaldı.')).toBeVisible();

    // Çıkış; artık yalnız yeni şifre çalışır.
    await page.getByRole('button', { name: 'Çıkış yap' }).click();
    await expect(page).toHaveURL(/\/isletme\/giris$/);
    await page.getByLabel('Kullanıcı adı').fill(business.username);
    await page.getByLabel('Şifre').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page).toHaveURL(/\/isletme$/);
    await expect(page.getByRole('heading', { name: 'Anka Kafe' })).toBeVisible();

    // Yeni oyun: ayarsız lobi açılır ve konsola gidilir.
    await page.getByRole('button', { name: 'Yeni oyun' }).click();
    await expect(page).toHaveURL(/\/isletme\/oyun\/[A-HJ-NP-Z2-9]{6}$/);
    const code = page.url().match(/oyun\/([A-HJ-NP-Z2-9]{6})$/)?.[1];
    expect(code).toBeDefined();
    await expect(page.getByText(`Oda ${code}`)).toBeVisible({ timeout: 15_000 });

    // Panele dönüş (telefon geri tuşu; konsolda panel gezinmesi yoktur);
    // aktif oturum listesinde "Oyuna dön".
    await page.goBack();
    await expect(page).toHaveURL(/\/isletme$/);
    await expect(page.getByText(`Oda ${code}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Hibrit · Lobi')).toBeVisible();
    await page.getByRole('button', { name: 'Oyuna dön' }).click();
    await expect(page).toHaveURL(new RegExp(`/isletme/oyun/${code}$`));
    await expect(page.getByText(`Oda ${code}`)).toBeVisible();

    // Lobiyi iptal et: oturum kimliği sunucu listesinden bulunur (M4c-1 b).
    await page.getByRole('button', { name: 'Lobiyi iptal et' }).click();
    const cancelDone = page.waitForResponse(
      (r) => r.url().includes('/cancel') && r.request().method() === 'POST' && r.status() === 200,
    );
    await page.getByRole('button', { name: 'Evet, iptal et' }).click();
    await cancelDone;

    // Panelde açık oturum kalmaz; yeni oyun tekrar mümkün.
    await page.goBack();
    await expect(page).toHaveURL(/\/isletme$/);
    await expect(page.getByText('Açık oturum yok.')).toBeVisible({ timeout: 15_000 });

    // Masaüstünde yan menü görünür, alt gezinme gizlenir.
    await page.setViewportSize({ width: 1280, height: 800 });
    const menu = page.getByRole('complementary', { name: 'Panel menü' });
    await expect(menu.getByRole('link', { name: 'Durumlarım' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Geçmiş' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Panel menü' })).toBeHidden();
  } finally {
    await context.close().catch(() => undefined);
  }
});
