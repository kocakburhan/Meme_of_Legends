import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { makePng } from '../global-setup';
const WEB = 'https://mol-game.kocakkburhann.workers.dev';
interface BusinessLobby {
  username: string;
  password: string;
  code: string;
}

// Gerçek canlı ağ; YouTube ve uygulama uçları sahtelenmez.
const YOUTUBE_ID = 'jNQXAC9IVRw';
async function newContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext();
}

async function joinPlayer(browser: Browser, code: string, nickname: string, spectator = false) {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB}/oda/${code}`);
  await page.getByLabel('Takma adın').fill(nickname);
  if (spectator) await page.getByText('Seyirci', { exact: true }).click();
  await page.getByRole('button', { name: 'Odaya gir' }).click();
  await expect(page.getByRole('heading', { name: `Hazırsın, ${nickname}` })).toBeVisible();
  return { context, page };
}

/** Yükle sekmesinden dosya seçer, önizlemeyi bekler ve seçimi gönderir. */
async function uploadAndSelect(page: Page, buffer: Buffer, name: string) {
  await page.getByRole('tab', { name: 'Yükle' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer,
  });
  await expect(page.getByRole('img', { name: 'Yüklediğin içerik' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Bu içeriği seç' }).click();
  await expect(page.getByText(/Seçim gönderildi/)).toBeVisible();
}

/** Slot sırasına göre farklı puan: eşitlik/uzatma olmadan net sıralama. */
const SLOT_SCORES = [5, 3, 2];

async function currentSlotIndex(page: Page): Promise<number> {
  const label = await page
    .getByText(/Gönderi \d+ \/ \d+/)
    .first()
    // Aşama geçişiyle metin kaybolabilir; sınırsız beklemeyi önle.
    .textContent({ timeout: 1_000 })
    .catch(() => null);
  return Number.parseInt(label?.match(/Gönderi (\d+)/)?.[1] ?? '1', 10);
}

/** Gönderim boyunca slota göre bir kez puan verir; gözden geçirmede döner. */
async function rateUntilReview(page: Page, timeoutMs = 140_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.getByText('Final gözden geçirme').count()) return;
    try {
      const score = SLOT_SCORES[(await currentSlotIndex(page)) - 1] ?? 3;
      const target = page.getByRole('radio', { name: String(score), exact: true });
      if (
        (await target.count()) === 1 &&
        (await target.isEnabled()) &&
        (await target.getAttribute('aria-checked')) !== 'true'
      )
        await target.click();
    } catch {
      /* Slot geçişi tıklamayı düşürebilir; yeniden denenir. */
    }
    await page.waitForTimeout(350);
  }
  throw new Error('Gösterimden gözden geçirmeye geçilemedi');
}

test('özel içerik: yükleme, red, yeniden seçim, YouTube, gösterim ve silme', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  let businessId = '';
  let memeId = '';
  let libraryTitle = '';
  const username = `live-${Date.now()}`;
  const businessName = `Canlı test ${new Date().toISOString()}`;
  const lobby: BusinessLobby = { username, password: '', code: '' };
  const contexts: BrowserContext[] = [];
  try {
    // Trace kapalı; admin şifresi hiçbir artefakta yazılmaz.
    await admin.goto(`${WEB}/admin/giris`);
    await admin.getByLabel('Kullanıcı adı').fill('mol-admin');
    const password = process.env.MOL_ADMIN_PASSWORD;
    if (!password) throw new Error('MOL_ADMIN_PASSWORD gerekli');
    await admin.getByLabel('Şifre').fill(password);
    await admin.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(admin.getByRole('heading', { name: 'Genel bakış' })).toBeVisible();
    await admin.screenshot({ path: test.info().outputPath('01-admin.png') });
    await admin.goto(`${WEB}/admin/isletmeler`);
    await admin.getByRole('button', { name: 'İşletme Oluştur' }).click();
    await admin.getByLabel('İşletme adı').fill(businessName);
    await admin.getByLabel('Kullanıcı adı').fill(username);
    await admin.getByLabel('Başlangıç hakkı').fill('1');
    lobby.password = await admin.getByLabel('Önerilen şifre').inputValue();
    const created = admin.waitForResponse(
      (r) => r.url().endsWith('/api/admin/businesses') && r.request().method() === 'POST',
    );
    await admin.getByRole('button', { name: 'Oluştur' }).click();
    businessId = (await (await created).json()).business.id;
    const summary = admin.getByRole('note', { name: 'Giriş bilgileri' });
    await expect(summary).toContainText(username);
    await summary.getByRole('link', { name: 'İşletmeye git' }).click();
    await expect(admin.getByRole('heading', { name: businessName })).toBeVisible();
    const popup = adminContext.waitForEvent('page');
    await admin.getByRole('button', { name: 'Adına giriş' }).click();
    const impersonated = await popup;
    await expect(impersonated.getByRole('heading', { name: businessName })).toBeVisible();
    await impersonated.close();
    console.log('PASS admin giriş, genel bakış, işletme, bilgiler, adına giriş');
    const managerContext = await browser.newContext();
    contexts.push(managerContext);
    const manager = await managerContext.newPage();
    await manager.goto(`${WEB}/isletme/giris`);
    await manager.getByLabel('Kullanıcı adı').fill(username);
    await manager.getByLabel('Şifre').fill(lobby.password);
    await manager.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(manager).toHaveURL(/\/isletme$/);
    await manager.getByRole('button', { name: 'Yeni oyun' }).click();
    await expect(manager).toHaveURL(/\/isletme\/oyun\/[A-Z2-9]{6}$/);
    lobby.code = manager.url().split('/').at(-1)!;
    const settings = manager.getByRole('region', { name: 'Mod ve ayarlar', exact: true });
    await settings.getByRole('radio', { name: 'Lig', exact: true }).click();
    for (const [label, value] of [
      ['Lig tur sayısı', '1'],
      ['Seçim süresi', '240'],
      ['Final gözden geçirme süresi', '30'],
    ]) {
      await settings.getByRole('spinbutton', { name: label, exact: true }).fill(value!);
      await settings.getByRole('spinbutton', { name: label, exact: true }).blur();
      await manager.waitForTimeout(500);
    }
    await manager.screenshot({ path: test.info().outputPath('02-console.png') });
    console.log('PASS işletme girişi, Yeni oyun, lig 1 tur konsol');
    const consoleApp = {
      context: managerContext,
      page: manager,
      gameTab: manager.locator('#console-game'),
    };
    const { page: managerPage, gameTab } = consoleApp;

    // Ortak ekran: konsoldan eşleştirme kodu → /ekran → "Ekranı başlat".
    await managerPage.getByText('Ortak ekran').click();
    await managerPage.getByRole('button', { name: 'Eşleştirme kodu üret' }).click();
    const pairCode = (await managerPage.getByLabel('Eşleştirme kodu').textContent())?.trim() ?? '';
    expect(pairCode).toMatch(/^\d{6}$/);

    const displayContext = await newContext(browser);
    contexts.push(displayContext);
    const display = await displayContext.newPage();
    await display.setViewportSize({ width: 1280, height: 720 });
    await display.goto(`${WEB}/ekran`);
    await display.getByLabel('Eşleştirme kodu').fill(pairCode);
    await display.getByRole('button', { name: 'Eşleştir' }).click();
    await display.getByRole('button', { name: 'Ekranı başlat' }).click();
    await expect(display.getByText("Oyun kodunu yaz ya da QR'ı okut")).toBeVisible();

    // Üç oyuncu katılır; konsoldan başlatılır.
    const duman = await joinPlayer(browser, lobby.code, 'Duman');
    contexts.push(duman.context);
    const kral = await joinPlayer(browser, lobby.code, 'Kral');
    contexts.push(kral.context);
    const sims = await joinPlayer(browser, lobby.code, 'Şimşek');
    contexts.push(sims.context);

    const spectator = await joinPlayer(browser, lobby.code, 'İzleyici', true);
    contexts.push(spectator.context);
    await expect(display.getByText('3 oyuncu · 1 seyirci')).toBeVisible();
    await display.screenshot({ path: test.info().outputPath('03-lobby.png') });
    console.log('PASS ortak ekran eşleştirme, 3 telefon oyuncu ve seyirci');
    const memes = await (
      await adminContext.request.get(`${WEB}/api/admin/memes?status=active`)
    ).json();
    if (memes.memes.length) libraryTitle = memes.memes[0].description;
    else {
      const categories = await (
        await adminContext.request.get(`${WEB}/api/admin/categories`)
      ).json();
      const category = categories.categories.find((c: { archived: boolean }) => !c.archived);
      if (!category) console.log('BLOCKED kütüphane: aktif meme ve kategori yok');
      if (category) {
        libraryTitle = `Canlı smoke ${Date.now()}`;
        const uploaded = await adminContext.request.post(`${WEB}/api/admin/memes`, {
          multipart: {
            file: { name: 'live.png', mimeType: 'image/png', buffer: makePng(24, [80, 120, 230]) },
            meta: JSON.stringify({
              mediaType: 'image',
              durationMs: null,
              categoryId: category.id,
              description: libraryTitle,
            }),
          },
        });
        expect(uploaded.status()).toBe(201);
        memeId = (await uploaded.json()).meme.id;
      }
    }
    await gameTab.getByRole('button', { name: 'Başlat' }).click();
    await managerPage.getByRole('button', { name: 'Evet, başlat', exact: true }).click();
    await expect(managerPage.getByText('Tur 1 · Seçim')).toBeVisible({ timeout: 15_000 });

    // 1) Duman PNG yükler; yönetici canlı listeden reddeder.
    for (const page of [duman.page, kral.page, sims.page])
      await expect(page.getByText('Kütüphane yükleniyor…')).toBeHidden({ timeout: 30_000 });

    await uploadAndSelect(duman.page, makePng(24, [230, 70, 70]), 'kirmizi.png');
    const customSection = gameTab.locator('section[aria-label="Özel içerik (canlı)"]');
    await expect(customSection.getByText('Duman', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(customSection.locator('img[src*="/custom/uploads/"]')).toBeVisible();

    await customSection.getByRole('button', { name: 'Reddet' }).click();
    // Onay diyaloğu erişilebilirlik için document.body'ye taşınır (portal).
    await managerPage.getByRole('dialog').getByRole('button', { name: 'Evet, reddet' }).click();
    await expect(duman.page.getByText('Bu içerik kabul edilmedi')).toBeVisible({
      timeout: 20_000,
    });

    // 2) Duman yeniden seçer (kütüphaneden); Kral PNG yükler; Şimşek YouTube klibi seçer.
    await duman.page.getByRole('tab', { name: 'Kütüphane' }).click();
    if (libraryTitle)
      await duman.page.getByRole('button', { name: libraryTitle, exact: true }).click();
    else await uploadAndSelect(duman.page, makePng(24, [200, 100, 20]), 'fallback.png');

    await uploadAndSelect(kral.page, makePng(24, [70, 200, 120]), 'yesil.png');
    const uploadSrc = await kral.page
      .getByRole('img', { name: 'Yüklediğin içerik' })
      .getAttribute('src');
    expect(uploadSrc).toMatch(/\/custom\/uploads\//);

    await sims.page.getByRole('tab', { name: 'YouTube' }).click();
    await sims.page.getByLabel('YouTube linki').fill(`https://youtu.be/${YOUTUBE_ID}`);
    await sims.page.getByRole('button', { name: 'Linki doğrula' }).click();
    console.log('PASS PNG yükleme, yönetici reddi ve yeniden seçim');
    // Gerçek YouTube oynatıcısından süre beklenir.
    try {
      await expect(sims.page.getByLabel('Başlangıç')).toBeVisible({ timeout: 30_000 });
      await sims.page.getByLabel('Başlangıç', { exact: true }).press('ArrowRight');
      await sims.page.getByLabel('Bitiş', { exact: true }).press('ArrowLeft');
      await sims.page.screenshot({ path: test.info().outputPath('04-youtube.png') });
      await sims.page.getByRole('button', { name: 'Bu aralığı seç' }).click();
      console.log('PASS gerçek YouTube doğrulama ve kırpma');
    } catch {
      await sims.page.screenshot({ path: test.info().outputPath('04-youtube-failed.png') });
      console.log(
        'FAIL gerçek YouTube kırpma',
        await sims.page.getByRole('alert').allTextContents(),
      );
      expect.soft(false, 'Gerçek YouTube kırpma tamamlanamadı').toBe(true);
      await uploadAndSelect(sims.page, makePng(24, [120, 50, 200]), 'youtube-fallback.png');
    }

    // Onaylar: son onay seçimi erken bitirir.
    await kral.page.getByRole('button', { name: 'Seçimimi onayla' }).click();
    await sims.page.getByRole('button', { name: 'Seçimimi onayla' }).click();
    await duman.page.getByRole('button', { name: 'Seçimimi onayla' }).click();

    // Gösterim: 3 geçerli gönderi; YouTube başarısızsa PNG ile kalan akış sınanır.
    await expect(display.getByText(/Gönderi 1 \/ 3/)).toBeVisible({ timeout: 30_000 });
    // Sıra rastgele; ortak ekran medya kontrolü ve telefonlarda puanlama birlikte yürür.
    await display.screenshot({ path: test.info().outputPath('presentation.png') });
    await Promise.all([
      expect(display.locator('img[src^="blob:"]')).toBeVisible({ timeout: 120_000 }),
      rateUntilReview(duman.page),
      rateUntilReview(kral.page),
      rateUntilReview(sims.page),
      rateUntilReview(spectator.page),
    ]);

    // Gözden geçirme → herkes bitirir → sonuç → hemen geç → final.
    for (const page of [duman.page, kral.page, sims.page, spectator.page]) {
      await expect(page.getByRole('button', { name: /Bitirdim/ })).toBeVisible({
        timeout: 120_000,
      });
      await page.getByRole('button', { name: /Bitirdim/ }).click();
    }
    await expect(display.getByText(/tur sonuçları/)).toBeVisible({ timeout: 60_000 });
    await gameTab.getByRole('button', { name: 'Hemen geç' }).click();
    await expect(gameTab.getByRole('button', { name: 'Rövanş' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(display.getByText(/Şampiyon:/)).toBeVisible({ timeout: 30_000 });

    // Oyun bitince özel dosya adresi artık erişilemez (R2 + DB temizlendi).
    expect(uploadSrc).not.toBeNull();
    const status = await kral.page.evaluate(async (path) => {
      const response = await fetch(path, { cache: 'no-store' });
      return response.status;
    }, uploadSrc!);
    expect([403, 404]).toContain(status);
    await display.screenshot({ path: test.info().outputPath('05-finished.png') });
    console.log('PASS gösterim, puanlama, sonuç, oyun sonu ve özel dosya temizliği', status);
    expect.soft(libraryTitle, 'Kütüphane seçimi aktif kategori ve meme gerektiriyor').not.toBe('');
  } catch (error) {
    for (const [index, context] of contexts.entries())
      for (const [pageIndex, page] of context.pages().entries())
        await page
          .screenshot({ path: test.info().outputPath(`failure-${index}-${pageIndex}.png`) })
          .catch(() => undefined);
    throw error;
  } finally {
    if (memeId) {
      const response = await adminContext.request.patch(`${WEB}/api/admin/memes/${memeId}`, {
        data: { status: 'archived' },
      });
      expect(response.ok()).toBe(true);
      console.log('CLEANUP meme arşivlendi', memeId);
    }
    if (businessId) {
      const response = await adminContext.request.patch(
        `${WEB}/api/admin/businesses/${businessId}`,
        { data: { active: false } },
      );
      expect(response.ok()).toBe(true);
      console.log('CLEANUP işletme pasife alındı', businessId);
    }
    await adminContext.close();
    for (const context of contexts) await context.close().catch(() => undefined);
  }
});
