import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { makePng } from '../global-setup';
import { createBusinessAndLobby, WEB, type BusinessLobby } from '../helpers/driver';

/**
 * M6b-2 (görev 6): özel içerik açık lig oyunu uçtan uca.
 * - Bir oyuncu testte üretilen PNG'yi yükler, yönetici reddeder; oyuncu yeniden seçer.
 * - Başka bir oyuncu PNG yükler; biri YouTube klibi seçer. YouTube doğrulama ucu
 *   ve IFrame API Playwright route/stub ile sahtelenir; ağa çıkılmaz.
 * - Gösterimde özel içerik diğer oyunculara ve ortak ekrana görünür.
 * - Oyun bitince özel dosya adresi 404/403 olur (cleanupCustom).
 */

test.describe.configure({ mode: 'serial' });

const YOUTUBE_ID = 'dQw4w9WgXcQ';

const SETTINGS = {
  mode: 'league' as const,
  leagueRounds: 1,
  selectionSeconds: 90,
  reviewSeconds: 20,
  customContent: true,
};

/**
 * IFrame Player API ikamesi: `window.YT.Player` sahte bir oynatıcı kurar,
 * gizlilik modlu embed adresli bir iframe oluşturur ve süre/konum bildirir.
 * Böylece e2e YouTube'a ağ isteği yapmaz (görev 6).
 */
const YOUTUBE_STUB = `
(() => {
  class MockPlayer {
    constructor(element, options) {
      this.options = options;
      this.offset = 0;
      this.playing = false;
      this.startedAt = 0;
      this.muted = false;
      const iframe = document.createElement('iframe');
      iframe.setAttribute('src', 'https://www.youtube-nocookie.com/embed/' + options.videoId + '?enablejsapi=1');
      iframe.setAttribute('title', 'Sahte YouTube oynatıcı');
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      element.appendChild(iframe);
      this.iframe = iframe;
      setTimeout(() => {
        if (options.events && options.events.onReady) options.events.onReady({ target: this });
      }, 0);
    }
    getIframe() { return this.iframe; }
    getDuration() { return 30; }
    getCurrentTime() {
      return this.offset + (this.playing ? (Date.now() - this.startedAt) / 1000 : 0);
    }
    seekTo(seconds) { this.offset = seconds; this.startedAt = Date.now(); }
    playVideo() { this.playing = true; this.startedAt = Date.now(); }
    pauseVideo() { this.playing = false; }
    mute() { this.muted = true; }
    unMute() { this.muted = false; }
    destroy() { this.iframe.remove(); }
  }
  window.YT = { Player: MockPlayer };
})();
`;

/** Her bağlamda YouTube ağını kes: IFrame API sahte, embed ve kapak yerel. */
async function newContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addInitScript({ content: YOUTUBE_STUB });
  await context.route('https://www.youtube-nocookie.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Sahte gömme</title>',
    }),
  );
  await context.route('https://i.ytimg.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: makePng(8, [200, 200, 200]) }),
  );
  // Doğrulama ucu sahtelenir: istemci gerçek YouTube'a sormaz.
  await context.route('**/api/rooms/*/custom/youtube', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ videoId: YOUTUBE_ID, durationMs: null }),
    }),
  );
  return context;
}

async function joinPlayer(browser: Browser, code: string, nickname: string) {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB}/oda/${code}`);
  await page.getByLabel('Takma adın').fill(nickname);
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

async function openConsole(browser: Browser, lobby: BusinessLobby) {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${WEB}/isletme/giris`);
  await page.getByLabel('Kullanıcı adı').fill(lobby.username);
  await page.getByLabel('Şifre').fill(lobby.password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/isletme$/);
  await page.getByRole('button', { name: 'Oyuna dön' }).click();
  await expect(page).toHaveURL(new RegExp(`/isletme/oyun/${lobby.code}$`));
  await expect(page.getByText(`Oda ${lobby.code}`)).toBeVisible();
  return { context, page, gameTab: page.locator('#console-game') };
}

test('özel içerik: yükleme, red, yeniden seçim, YouTube, gösterim ve silme', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const lobby = await createBusinessAndLobby(SETTINGS);
  const contexts: BrowserContext[] = [];
  try {
    const consoleApp = await openConsole(browser, lobby);
    contexts.push(consoleApp.context);
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

    await expect(display.getByText('3 oyuncu · 0 seyirci')).toBeVisible();
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
    await customSection.getByRole('button', { name: 'Evet, reddet' }).click();
    await expect(duman.page.getByText('Bu içerik kabul edilmedi')).toBeVisible({
      timeout: 20_000,
    });

    // 2) Duman yeniden seçer (kütüphaneden); Kral PNG yükler; Şimşek YouTube klibi seçer.
    await duman.page.getByRole('tab', { name: 'Kütüphane' }).click();
    await duman.page.getByRole('button', { name: /Maaş yattı ama kira da yattı/ }).click();

    await uploadAndSelect(kral.page, makePng(24, [70, 200, 120]), 'yesil.png');
    const uploadSrc = await kral.page
      .getByRole('img', { name: 'Yüklediğin içerik' })
      .getAttribute('src');
    expect(uploadSrc).toMatch(/\/custom\/uploads\//);

    await sims.page.getByRole('tab', { name: 'YouTube' }).click();
    await sims.page.getByLabel('YouTube linki').fill(`https://youtu.be/${YOUTUBE_ID}`);
    await sims.page.getByRole('button', { name: 'Linki doğrula' }).click();
    // Sahte oynatıcı süreyi bildirir; kırpma çubuğu açılır.
    await expect(sims.page.getByLabel('Başlangıç')).toBeVisible({ timeout: 30_000 });
    await sims.page.getByRole('button', { name: 'Bu aralığı seç' }).click();

    // Onaylar: son onay seçimi erken bitirir.
    await kral.page.getByRole('button', { name: 'Seçimimi onayla' }).click();
    await sims.page.getByRole('button', { name: 'Seçimimi onayla' }).click();
    await duman.page.getByRole('button', { name: 'Seçimimi onayla' }).click();

    // Gösterim: 3 geçerli gönderi; özel PNG ve YouTube klibi tüm yüzeylerde.
    await expect(display.getByText(/Gönderi 1 \/ 3/)).toBeVisible({ timeout: 30_000 });
    // Sıra rastgele: dört içerik beklentisi ve puanlama aynı anda yürür.
    await Promise.all([
      // Ortak ekran yüklemeyi Bearer + blob URL ile gösterir (custom-content.md).
      expect(display.locator('img[src^="blob:"]')).toBeVisible({ timeout: 120_000 }),
      expect(display.locator('iframe[src*="youtube-nocookie.com/embed/"]')).toBeVisible({
        timeout: 120_000,
      }),
      // Gönderi sahibi olmayan telefon, yüklemeyi çerezle görür.
      expect(duman.page.locator('img[src*="/custom/uploads/"]')).toBeVisible({
        timeout: 120_000,
      }),
      expect(sims.page.locator('iframe[src*="youtube-nocookie.com/embed/"]')).toBeVisible({
        timeout: 120_000,
      }),
      rateUntilReview(duman.page),
      rateUntilReview(kral.page),
      rateUntilReview(sims.page),
    ]);

    // Gözden geçirme → herkes bitirir → sonuç → hemen geç → final.
    for (const page of [duman.page, kral.page, sims.page]) {
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
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined);
  }
});
