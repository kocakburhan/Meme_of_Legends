import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  createBusinessAndLobby,
  createDisplayPairCode,
  createLobby,
  joinViaApi,
  ManagerClient,
  playQuickLeagueGame,
  SERVER,
  WEB,
  type GameLobby,
} from '../helpers/driver';
import { E2E_ADMIN, makePng } from '../global-setup';
import {
  expectNoA11yViolations,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  resetTextZoom,
  setTextZoom,
} from '../helpers/a11y';

/**
 * M7c erişilebilirlik taramaları: katılımcı, ortak ekran, işletme paneli,
 * konsol ve admin paneli ekranları WCAG 2.1 AA kurallarıyla taranır.
 * Taramalarda hiçbir kural gerekçesiz kapatılmaz.
 */

const rand = (): string => crypto.randomUUID().slice(0, 8);

const GAME_SETTINGS = {
  mode: 'league' as const,
  leagueRounds: 1,
  selectionSeconds: 30,
  reviewSeconds: 15,
};

const YOUTUBE_ID = 'dQw4w9WgXcQ';

/**
 * IFrame Player API ikamesi (custom-content.spec.ts ile aynı yaklaşım):
 * YouTube'a ağ isteği gitmeden sahte oynatıcı süre/konum bildirir.
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
      iframe.setAttribute('title', options.videoId ? 'Sahte YouTube oynatıcı' : 'YouTube');
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

/** YouTube doğrulama ucu, embed ve kapak yereldir; ağa çıkılmaz. */
async function newMockedContext(
  browser: Browser,
  options: Parameters<Browser['newContext']>[0] = {},
): Promise<BrowserContext> {
  const context = await browser.newContext(options);
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
  await context.route('**/api/rooms/*/custom/youtube', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ videoId: YOUTUBE_ID, durationMs: null }),
    }),
  );
  return context;
}

async function loginBusiness(page: Page, username: string, password: string): Promise<void> {
  await page.goto(`${WEB}/isletme/giris`);
  await page.getByLabel('Kullanıcı adı').fill(username);
  await page.getByLabel('Şifre').fill(password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/isletme$/);
}

async function loginAdmin(page: Page): Promise<void> {
  await page.goto(`${WEB}/admin/giris`);
  await page.getByLabel('Kullanıcı adı').fill(E2E_ADMIN.username);
  await page.getByLabel('Şifre').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Tarayıcıdan katılımcı olarak girer; lobi ekranı hazır olana kadar bekler. */
async function joinUiPlayer(
  context: BrowserContext,
  code: string,
  nickname: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const page = await context.newPage();
  await page.goto(`${WEB}/oda/${code}`);
  await page.getByLabel('Takma adın').fill(nickname);
  await page.getByRole('button', { name: 'Odaya gir' }).click();
  await expect(page.getByRole('heading', { name: `Hazırsın, ${nickname}` })).toBeVisible();
  return { context, page };
}

interface BusinessIdentity {
  id: string;
  name: string;
  username: string;
  password: string;
}

async function identityOf(business: {
  username: string;
  password: string;
  businessCookie: string;
}): Promise<BusinessIdentity> {
  const response = await fetch(`${SERVER}/api/business/me`, {
    headers: { cookie: business.businessCookie },
  });
  if (!response.ok) throw new Error(`business me → ${response.status}`);
  const data = (await response.json()) as { business: { id: string; name: string } };
  return {
    id: data.business.id,
    name: data.business.name,
    username: business.username,
    password: business.password,
  };
}

test.describe.configure({ mode: 'serial' });

test('katılım ve giriş ekranları axe taramasından geçer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(`${WEB}/`);
  await expect(page.getByRole('heading', { name: /Meme of Legends/ })).toBeVisible();
  await expectNoA11yViolations(page, 'Katılım (/)');
  await expectNoHorizontalOverflow(page, 'Katılım (/)');
  await expectTouchTargets(page, 'Katılım (/)');

  // Alana bağlı hata: oda kodu ve takma ad ayrı hata kimlikleriyle bağlanır.
  const codeInput = page.getByLabel('Oda kodu');
  await page.getByRole('button', { name: 'Odaya gir' }).click();
  await expect(codeInput).toHaveAttribute('aria-invalid', 'true');
  const codeErrorId = await codeInput.getAttribute('aria-describedby');
  expect(codeErrorId).toBeTruthy();
  await expect(page.locator(`[id="${codeErrorId}"]`)).toHaveAttribute('role', 'alert');
  await codeInput.fill('ABC234');
  await page.getByRole('button', { name: 'Odaya gir' }).click();
  const nicknameInput = page.getByLabel('Takma adın');
  await expect(nicknameInput).toHaveAttribute('aria-invalid', 'true');
  const nicknameErrorId = await nicknameInput.getAttribute('aria-describedby');
  expect(nicknameErrorId).toBeTruthy();
  await expect(page.locator(`[id="${nicknameErrorId}"]`)).toHaveAttribute('role', 'alert');

  await page.goto(`${WEB}/isletme/giris`);
  await expect(page.getByRole('heading', { name: 'Yönetici girişi' })).toBeVisible();
  await expectNoA11yViolations(page, 'İşletme girişi');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  const usernameInput = page.getByLabel('Kullanıcı adı');
  const loginErrorId = await usernameInput.getAttribute('aria-describedby');
  expect(loginErrorId).toBeTruthy();
  await expect(usernameInput).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator(`[id="${loginErrorId}"]`)).toHaveAttribute('role', 'alert');

  await page.goto(`${WEB}/admin/giris`);
  await expect(page.getByRole('heading', { name: 'Admin girişi' })).toBeVisible();
  await expectNoA11yViolations(page, 'Admin girişi');
});

test('işletme paneli, durumlar, geçmiş ve konsol sekmeleri taranır', async ({ page }) => {
  test.setTimeout(420_000);
  const business = await createBusinessAndLobby({ ...GAME_SETTINGS });
  const promptText = `Erişilebilirlik durumu ${rand()}`;
  const promptCreated = await fetch(`${SERVER}/api/business/prompts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: business.businessCookie },
    body: JSON.stringify({ text: promptText }),
  });
  expect(promptCreated.ok).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await loginBusiness(page, business.username, business.password);

  // Panel ana sayfası: hesap kartı, yeni oyun, aktif/son oturumlar.
  await expect(page.getByRole('heading', { name: 'Anka Kafe' })).toBeVisible();
  await expectNoA11yViolations(page, 'İşletme paneli');
  await expectNoHorizontalOverflow(page, 'İşletme paneli');

  await page.goto(`${WEB}/isletme/durumlar`);
  await expect(page.getByText(promptText)).toBeVisible({ timeout: 15_000 });
  await expectNoA11yViolations(page, 'Durumlarım');

  await page.goto(`${WEB}/isletme/gecmis`);
  await expect(page.getByRole('heading', { name: 'Geçmiş' })).toBeVisible();
  await expectNoA11yViolations(page, 'Geçmiş');

  await page.goto(`${WEB}/isletme/hesap`);
  await expect(page.getByRole('heading', { name: 'Hesap' })).toBeVisible();
  await expectNoA11yViolations(page, 'Hesap');

  // Konsol: mobil sekmelerde Oyun, Katılımcılar ve Ayarlar ayrı taranır.
  await page.goto(`${WEB}/isletme/oyun/${business.code}`);
  await expect(page.getByText(`Oda ${business.code}`)).toBeVisible({ timeout: 15_000 });
  await expectNoA11yViolations(page, 'Konsol — Oyun (lobi)');
  await expectNoHorizontalOverflow(page, 'Konsol — Oyun (lobi)');
  await expectTouchTargets(page, 'Konsol — Oyun (lobi)');

  // Onay diyaloğu: odak tuzağı, Esc ile kapanma ve odağın geri dönüşü.
  const cancelLobby = page.getByRole('button', { name: 'Lobiyi iptal et' });
  await cancelLobby.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Lobiyi iptal et' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vazgeç' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Evet, iptal et' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Vazgeç' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(cancelLobby).toBeFocused();

  await page.getByRole('button', { name: 'Katılımcılar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Katılımcılar' })).toBeVisible();
  await expectNoA11yViolations(page, 'Konsol — Katılımcılar');
  await expectNoHorizontalOverflow(page, 'Konsol — Katılımcılar');
  await expectTouchTargets(page, 'Konsol — Katılımcılar');

  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Ayarlar' })).toBeVisible();
  await expectNoA11yViolations(page, 'Konsol — Ayarlar');
  await expectNoHorizontalOverflow(page, 'Konsol — Ayarlar');
  await expectTouchTargets(page, 'Konsol — Ayarlar');

  // Aynı lobide kısa oyun oynatılır; geçmiş detayı gerçek raporla taranır.
  const manager = await ManagerClient.connect(business.code, business.businessCookie);
  const lobby: GameLobby = {
    ...business,
    manager,
    close() {
      manager.close();
    },
  };
  const players = [await joinViaApi(lobby.code, 'Duman'), await joinViaApi(lobby.code, 'Kral')];
  try {
    for (const player of players) await player.client.view((view) => view.phase.kind === 'lobby');
    await playQuickLeagueGame(lobby, players);

    // Geçmiş listesi ve rapor detayı.
    await page.goto(`${WEB}/isletme/gecmis`);
    const row = page.getByRole('link', { name: new RegExp(`Oda ${lobby.code}`) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expectNoA11yViolations(page, 'Geçmiş — dolu liste');
    await row.click();
    await expect(page.getByLabel('Oyun özeti')).toBeVisible({ timeout: 15_000 });
    await expectNoA11yViolations(page, 'Geçmiş — oyun detayı');
    await expectNoHorizontalOverflow(page, 'Geçmiş — oyun detayı');
  } finally {
    for (const player of players) player.client.close();
    lobby.close();
  }
});

test('admin paneli sayfaları axe taramasından geçer', async ({ page }) => {
  test.setTimeout(420_000);
  const business = await createLobby(GAME_SETTINGS, {
    username: `e2e-a11y-${rand()}`,
    password: 'e2e-a11y-pass-123',
  });
  const identity = await identityOf(business);
  const players = [
    await joinViaApi(business.code, 'E2E Deniz'),
    await joinViaApi(business.code, 'E2E Ege'),
  ];
  try {
    for (const player of players) await player.client.view((view) => view.phase.kind === 'lobby');
    await playQuickLeagueGame(business, players);
  } finally {
    for (const player of players) player.client.close();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await loginAdmin(page);

  await expect(page.getByRole('heading', { name: 'Genel bakış' })).toBeVisible();
  await expectNoA11yViolations(page, 'Admin — Genel bakış');
  await expectNoHorizontalOverflow(page, 'Admin — Genel bakış');

  const pages: Array<{ path: string; heading: string; label: string }> = [
    { path: '/admin/isletmeler', heading: 'İşletmeler', label: 'Admin — İşletmeler' },
    { path: '/admin/icerik', heading: 'İçerik', label: 'Admin — İçerik' },
    {
      path: '/admin/icerik/kutuphane',
      heading: 'Meme kütüphanesi',
      label: 'Admin — Meme kütüphanesi',
    },
    { path: '/admin/icerik/kategoriler', heading: 'Kategoriler', label: 'Admin — Kategoriler' },
    {
      path: '/admin/icerik/durumlar',
      heading: 'Platform durumları',
      label: 'Admin — Platform durumları',
    },
    {
      path: '/admin/icerik/isletme-durumlari',
      heading: 'İşletme durumu denetimi',
      label: 'Admin — İşletme durumları',
    },
    {
      path: '/admin/icerik/etiketle',
      heading: 'Hızlı etiketleme',
      label: 'Admin — Hızlı etiketleme',
    },
    { path: '/admin/oturumlar', heading: 'Oturumlar', label: 'Admin — Oturumlar' },
    {
      path: '/admin/oturumlar/kullanim',
      heading: 'İşletme kullanımı',
      label: 'Admin — Kullanım',
    },
    {
      path: `/admin/oturumlar/${business.sessionId}`,
      heading: `Oda ${business.code}`,
      label: 'Admin — Oturum detayı',
    },
    {
      path: `/admin/isletmeler/${identity.id}`,
      heading: identity.name,
      label: 'Admin — İşletme detayı',
    },
    { path: '/admin/sistem', heading: 'Sistem', label: 'Admin — Sistem' },
  ];

  for (const entry of pages) {
    await page.goto(`${WEB}${entry.path}`);
    await expect(page.getByRole('heading', { name: entry.heading })).toBeVisible({
      timeout: 20_000,
    });
    await expectNoA11yViolations(page, entry.label);
    await expectNoHorizontalOverflow(page, entry.label);
  }

  business.close();
});

test('oyun ekranları: katılımcı, ortak ekran ve konsol aşamaları taranır', async ({ browser }) => {
  test.setTimeout(420_000);
  const lobby = await createLobby({
    ...GAME_SETTINGS,
    selectionSeconds: 120,
    customContent: true,
  });
  const contexts: BrowserContext[] = [];
  try {
    const pair = await createDisplayPairCode(lobby.manager);
    const displayContext = await newMockedContext(browser, {
      viewport: { width: 1280, height: 720 },
    });
    contexts.push(displayContext);
    const display = await displayContext.newPage();
    await display.goto(`${WEB}/ekran`);
    await expect(display.getByRole('heading', { name: 'Ekranı eşleştir' })).toBeVisible();
    await expectNoA11yViolations(display, 'Ortak ekran — eşleştirme');
    await display.getByLabel('Eşleştirme kodu').fill(pair.code);
    await display.getByRole('button', { name: 'Eşleştir' }).click();
    await display.getByRole('button', { name: 'Ekranı başlat' }).click();
    await expect(display.getByText("Oyun kodunu yaz ya da QR'ı okut")).toBeVisible();

    const dumanContext = await newMockedContext(browser, {
      viewport: { width: 390, height: 844 },
    });
    const duman = await joinUiPlayer(dumanContext, lobby.code, 'Duman');
    contexts.push(duman.context);
    const kralContext = await newMockedContext(browser, {
      viewport: { width: 390, height: 844 },
    });
    const kral = await joinUiPlayer(kralContext, lobby.code, 'Kral');
    contexts.push(kral.context);

    const managerContext = await newMockedContext(browser, {
      viewport: { width: 390, height: 844 },
    });
    contexts.push(managerContext);
    const managerPage = await managerContext.newPage();
    await loginBusiness(managerPage, lobby.username, lobby.password);
    await managerPage.goto(`${WEB}/isletme/oyun/${lobby.code}`);
    const gameTab = managerPage.locator('#console-game');
    const customSection = gameTab.locator('section[aria-label="Özel içerik (canlı)"]');
    await expect(managerPage.getByText(`Oda ${lobby.code}`)).toBeVisible({ timeout: 15_000 });

    // Lobi: katılımcı, ortak ekran ve konsol.
    await expectNoA11yViolations(duman.page, 'Katılımcı — lobi');
    await expectTouchTargets(duman.page, 'Katılımcı — lobi');
    await expectNoA11yViolations(display, 'Ortak ekran — lobi');
    await expectNoA11yViolations(managerPage, 'Konsol — lobi');

    expect((await lobby.manager.command({ type: 'start' })).ok).toBe(true);
    await expect(duman.page.getByText('Kütüphane yükleniyor…')).toBeHidden();
    await expect(display.getByText('oyuncu seçti')).toBeVisible({ timeout: 20_000 });

    // Seçim: kütüphane sekmesi, hazır sayacı, ortak ekran sahnesi.
    await expectNoA11yViolations(duman.page, 'Katılımcı — seçim (Kütüphane)');
    await expectTouchTargets(duman.page, 'Katılımcı — seçim (Kütüphane)');
    await expectNoA11yViolations(display, 'Ortak ekran — seçim');
    await expect(managerPage.getByText('Tur 1 · Seçim')).toBeVisible({ timeout: 20_000 });
    await expectNoA11yViolations(managerPage, 'Konsol — seçim kartı');

    // Sekmeler klavyeyle: ok tuşu odağı ve seçimi taşır; Yükle ve YouTube taranır.
    const libraryTab = duman.page.getByRole('tab', { name: 'Kütüphane' });
    await libraryTab.press('ArrowRight');
    const uploadTab = duman.page.getByRole('tab', { name: 'Yükle' });
    await expect(uploadTab).toHaveAttribute('aria-selected', 'true');
    await expect(duman.page.getByRole('tabpanel')).toContainText("Kendi resmin ya da GIF'in");
    await expectNoA11yViolations(duman.page, 'Katılımcı — seçim (Yükle)');
    await expectTouchTargets(duman.page, 'Katılımcı — seçim (Yükle)');

    await uploadTab.press('ArrowRight');
    const youtubeTab = duman.page.getByRole('tab', { name: 'YouTube' });
    await expect(youtubeTab).toHaveAttribute('aria-selected', 'true');
    const youtubeInput = duman.page.getByLabel('YouTube linki');
    await expect(youtubeInput).toBeVisible();
    // Alana bağlı hata: boş link doğrulanınca aria-describedby hata kimliğini kapsar.
    await duman.page.getByRole('button', { name: 'Linki doğrula' }).click();
    await expect(youtubeInput).toHaveAttribute('aria-invalid', 'true');
    const youtubeErrorId = await youtubeInput.getAttribute('aria-describedby');
    expect(youtubeErrorId).toBeTruthy();
    await expect(duman.page.locator(`[id="${youtubeErrorId!.split(' ').at(-1)}"]`)).toHaveAttribute(
      'role',
      'alert',
    );
    await expectNoA11yViolations(duman.page, 'Katılımcı — seçim (YouTube)');
    await expectTouchTargets(duman.page, 'Katılımcı — seçim (YouTube)');
    await youtubeTab.press('Home');
    await expect(libraryTab).toHaveAttribute('aria-selected', 'true');

    // Yükle: dosya seçimi → ilerleme/önizleme → seçim.
    await uploadTab.click();
    await duman.page.locator('input[type="file"]').setInputFiles({
      name: 'a11y.png',
      mimeType: 'image/png',
      buffer: makePng(24, [230, 70, 70]),
    });
    await expect(duman.page.getByRole('img', { name: 'Yüklediğin içerik' })).toBeVisible({
      timeout: 30_000,
    });
    await expectNoA11yViolations(duman.page, 'Katılımcı — seçim (Yükle, önizleme)');
    await duman.page.getByRole('button', { name: 'Bu içeriği seç' }).click();
    await expect(duman.page.getByText(/^Seçim gönderildi;/)).toBeVisible();

    // YouTube: bağlantı doğrulama → sahte oynatıcı → kırpma → seçim.
    await kral.page.getByRole('tab', { name: 'YouTube' }).click();
    await kral.page.getByLabel('YouTube linki').fill(`https://youtu.be/${YOUTUBE_ID}`);
    await kral.page.getByRole('button', { name: 'Linki doğrula' }).click();
    await expect(kral.page.getByLabel('Başlangıç')).toBeVisible({ timeout: 30_000 });
    await expectNoA11yViolations(kral.page, 'Katılımcı — seçim (YouTube, kırpma)');
    await expectTouchTargets(kral.page, 'Katılımcı — seçim (YouTube, kırpma)');
    await kral.page.getByRole('button', { name: 'Bu aralığı seç' }).click();
    await expect(kral.page.getByText(/^Seçim gönderildi;/)).toBeVisible();

    // Konsolun canlı özel içerik listesi: yükleme + YouTube satırları.
    await expect(customSection.getByText('Duman', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(customSection.getByText('Kral', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expectNoA11yViolations(managerPage, 'Konsol — seçim kartı (özel içerik)');
    await expectTouchTargets(managerPage, 'Konsol — seçim kartı (özel içerik)');

    for (const page of [duman.page, kral.page]) {
      await page.getByRole('button', { name: 'Seçimimi onayla' }).click();
    }
    await expect(duman.page.getByText('Gönderi 1 / 2', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(display.getByText('Gönderi 1 / 2', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(duman.page.getByText('Gönderim sırası başladı. Sıra 1; toplam 2.')).toBeAttached();
    await expect(duman.page.getByText(/kişi puan verdi/)).toHaveAttribute('aria-live', 'polite');

    // Gösterim + puanlama: iki slotta farklı ortalamalar → uzatma yok.
    for (let slot = 1; slot <= 2; slot++) {
      await expect(duman.page.getByText(`Gönderi ${slot} / 2`, { exact: true })).toBeVisible({
        timeout: 60_000,
      });
      if (slot === 1) {
        await expectNoA11yViolations(duman.page, 'Katılımcı — gösterim + puanlama');
        await expectTouchTargets(duman.page, 'Katılımcı — gösterim + puanlama');
        await expectNoA11yViolations(display, 'Ortak ekran — gösterim');
        await expect(gameTab.getByText('Gönderi 1 / 2', { exact: true })).toBeVisible({
          timeout: 20_000,
        });
        await expectNoA11yViolations(managerPage, 'Konsol — gösterim kartı');
        // Puan düğmeleri klavyeyle: ok tuşu seçimi değiştirir.
        const canRateDuman = await duman.page
          .getByRole('radio', { name: '1', exact: true })
          .isEnabled();
        const ratingPage = canRateDuman ? duman.page : kral.page;
        const firstScore = ratingPage.getByRole('radio', { name: '1', exact: true });
        await firstScore.focus();
        await ratingPage.keyboard.press('ArrowRight');
        await expect(ratingPage.getByRole('radio', { name: '2', exact: true })).toHaveAttribute(
          'aria-checked',
          'true',
        );
        const focusRing = await ratingPage.evaluate(() => {
          const active = document.activeElement;
          if (!(active instanceof HTMLElement)) return null;
          const style = getComputedStyle(active);
          return {
            style: style.outlineStyle,
            width: Number.parseFloat(style.outlineWidth),
          };
        });
        expect(focusRing?.style).not.toBe('none');
        expect(focusRing?.width ?? 0).toBeGreaterThanOrEqual(2);
      }
      const dumanScore = duman.page.getByRole('radio', { name: '5', exact: true });
      if (await dumanScore.isEnabled()) await dumanScore.click();
      const kralScore = kral.page.getByRole('radio', { name: '3', exact: true });
      if (await kralScore.isEnabled()) await kralScore.click();
    }

    // Final gözden geçirme.
    await expect(duman.page.getByText('Final gözden geçirme', { exact: true })).toBeVisible({
      timeout: 90_000,
    });
    await expect(
      duman.page.getByText(
        'Puanlama gözden geçirmesi başladı. Eksik puanlarını tamamlayabilirsin.',
      ),
    ).toBeAttached();
    await expectNoA11yViolations(duman.page, 'Katılımcı — final gözden geçirme');
    await expectTouchTargets(duman.page, 'Katılımcı — final gözden geçirme');
    await expectNoA11yViolations(display, 'Ortak ekran — final gözden geçirme');
    await expect(gameTab.getByText('Final gözden geçirme', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expectNoA11yViolations(managerPage, 'Konsol — gözden geçirme kartı');

    // Bitir → sonuç ekranı kısa süre görünür; bu arada tarama yapılır.
    for (const page of [duman.page, kral.page])
      await page.getByRole('button', { name: /Bitirdim/ }).click();
    await expect(duman.page.getByRole('heading', { name: /tur sonuçları/ })).toBeVisible({
      timeout: 30_000,
    });
    await expectNoA11yViolations(duman.page, 'Katılımcı — tur sonuçları');
    await expectNoA11yViolations(display, 'Ortak ekran — tur sonuçları');

    await lobby.manager.view((view) => view.phase.kind === 'results');
    expect((await lobby.manager.command({ type: 'skipResults' })).ok).toBe(true);

    // Oyun sonu: şampiyon, kürsü ve sıralama.
    await expect(duman.page.getByText(/Şampiyon:/)).toBeVisible({ timeout: 30_000 });
    await expectNoA11yViolations(duman.page, 'Katılımcı — oyun sonu');
    await expectTouchTargets(duman.page, 'Katılımcı — oyun sonu');
    await expect(display.getByText(/Şampiyon:/)).toBeVisible({ timeout: 20_000 });
    await expectNoA11yViolations(display, 'Ortak ekran — oyun sonu');
    await expect(gameTab.getByRole('button', { name: 'Rövanş' })).toBeVisible({ timeout: 20_000 });
    await expectNoA11yViolations(managerPage, 'Konsol — oyun sonu');
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined);
    lobby.close();
  }
});

test('%200 metin büyütmede katılımcı ve konsol yatay taşmaz', async ({ browser }) => {
  test.setTimeout(300_000);
  const lobby = await createLobby({ ...GAME_SETTINGS });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  let second: Awaited<ReturnType<typeof joinViaApi>> | null = null;
  try {
    await loginBusiness(page, lobby.username, lobby.password);
    await page.goto(`${WEB}/isletme/oyun/${lobby.code}`);
    await expect(page.getByText(`Oda ${lobby.code}`)).toBeVisible({ timeout: 15_000 });

    await setTextZoom(page);
    await expectNoHorizontalOverflow(page, 'Konsol — %200 metin (Oyun)');
    await page.getByRole('button', { name: 'Katılımcılar', exact: true }).click();
    await expectNoHorizontalOverflow(page, 'Konsol — %200 metin (Katılımcılar)');
    await page.getByRole('button', { name: 'Ayarlar', exact: true }).click();
    await expectNoHorizontalOverflow(page, 'Konsol — %200 metin (Ayarlar)');
    await resetTextZoom(page);

    // Katılımcı: katılım, lobi, seçim ve gösterim.
    await page.goto(`${WEB}/oda/${lobby.code}`);
    await setTextZoom(page);
    await expectNoHorizontalOverflow(page, 'Katılım — %200 metin');
    await resetTextZoom(page);
    await page.getByLabel('Takma adın').fill('Duman');
    await page.getByRole('button', { name: 'Odaya gir' }).click();
    await expect(page.getByRole('heading', { name: 'Hazırsın, Duman' })).toBeVisible();
    await setTextZoom(page);
    await expectNoHorizontalOverflow(page, 'Lobi — %200 metin');
    await resetTextZoom(page);

    second = await joinViaApi(lobby.code, 'Sessiz');
    await second.client.view((view) => view.phase.kind === 'lobby');
    expect((await lobby.manager.command({ type: 'start' })).ok).toBe(true);
    await expect(page.getByText('Kütüphane yükleniyor…')).toBeHidden();
    await second.client.view((view) => view.phase.kind === 'selection');
    await setTextZoom(page);
    await expectNoHorizontalOverflow(page, 'Seçim — %200 metin');
    await resetTextZoom(page);

    const media = { source: 'system' as const, memeId: 'm-e2e-0', mediaType: 'image' as const };
    expect((await second.client.command({ type: 'select', media })).ok).toBe(true);
    expect((await second.client.command({ type: 'confirm' })).ok).toBe(true);
    await page.getByRole('button', { name: /Maaş yattı ama kira da yattı/ }).click();
    await page.getByRole('button', { name: 'Seçimimi onayla' }).click();
    await expect(page.getByText('Gönderi 1 / 2', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await setTextZoom(page);
    await expectNoHorizontalOverflow(page, 'Gösterim — %200 metin');
    await resetTextZoom(page);
  } finally {
    second?.client.close();
    await context.close().catch(() => undefined);
    lobby.close();
  }
});

test('prefers-reduced-motion: animasyonlar durur, seçim akışı çalışır', async ({ browser }) => {
  test.setTimeout(300_000);
  const lobby = await createLobby({ ...GAME_SETTINGS });
  const contexts: Awaited<ReturnType<Browser['newContext']>>[] = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    contexts.push(context);
    const page = await context.newPage();
    await page.goto(`${WEB}/oda/${lobby.code}`);
    await page.getByLabel('Takma adın').fill('Sakin');
    await page.getByRole('button', { name: 'Odaya gir' }).click();
    await expect(page.getByRole('heading', { name: 'Hazırsın, Sakin' })).toBeVisible();

    const secondContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    contexts.push(secondContext);
    const secondPage = await secondContext.newPage();
    await secondPage.goto(`${WEB}/oda/${lobby.code}`);
    await secondPage.getByLabel('Takma adın').fill('Sessiz');
    await secondPage.getByRole('button', { name: 'Odaya gir' }).click();
    await expect(secondPage.getByRole('heading', { name: 'Hazırsın, Sessiz' })).toBeVisible();

    // Medya sorgusu etkin ve animasyon süresi sıfıra indirilmiş.
    const motion = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.className = 'animate-pulse-slow';
      document.body.append(probe);
      const duration = getComputedStyle(probe).animationDuration;
      probe.remove();
      return {
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        duration: Number.parseFloat(duration),
      };
    });
    expect(motion.reduced).toBe(true);
    expect(motion.duration).toBeLessThanOrEqual(0.01);

    expect((await lobby.manager.command({ type: 'start' })).ok).toBe(true);
    await expect(page.getByText('Kütüphane yükleniyor…')).toBeHidden();
    await page.getByRole('button', { name: /Maaş yattı ama kira da yattı/ }).click();
    await page.getByRole('button', { name: 'Seçimimi onayla' }).click();
    await secondPage.getByRole('button', { name: /Maaş yattı ama kira da yattı/ }).click();
    await secondPage.getByRole('button', { name: 'Seçimimi onayla' }).click();
    await expect(page.getByText('Gönderi 1 / 2', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expectNoA11yViolations(page, 'Azaltılmış hareket — gösterim');
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined);
    lobby.close();
  }
});
