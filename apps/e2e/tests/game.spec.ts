import { expect, test, type Browser, type Page } from '@playwright/test';
import { createDisplayPairCode, createLobby, WEB, type GameLobby } from '../helpers/driver';

/**
 * M3b uçtan uca: gerçek yerel sunucu (wrangler dev) + web (vite dev).
 * 3 oyuncu + 1 seyirci + ortak ekran ile lig modunda 1 turluk tam oyun;
 * yeniden bağlanma; geç katılan seyircinin puanlayamaması; cihaz devri.
 */

test.describe.configure({ mode: 'serial' });

const SELECTION_SETTINGS = {
  mode: 'league' as const,
  leagueRounds: 1,
  selectionSeconds: 30,
  reviewSeconds: 15,
};

async function joinParticipant(
  browser: Browser,
  code: string,
  nickname: string,
  role: 'player' | 'voter',
): Promise<{ context: Awaited<ReturnType<Browser['newContext']>>; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB}/oda/${code}`);
  await page.getByLabel('Takma adın').fill(nickname);
  if (role === 'voter') await page.getByText('Seyirci', { exact: true }).click();
  await page.getByRole('button', { name: 'Odaya gir' }).click();
  await expect(page.getByRole('heading', { name: `Hazırsın, ${nickname}` })).toBeVisible();
  return { context, page };
}

async function rateUntilReview(page: Page, timeoutMs = 140_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.getByText('Final gözden geçirme').count()) return;
    const radio = page.locator('button[role="radio"]:not([disabled])').first();
    if (await radio.count()) {
      if ((await radio.getAttribute('aria-checked')) !== 'true') {
        await radio.click().catch(() => {
          /* Slot geçişi tıklamayı düşürebilir; yeniden denenir. */
        });
      }
    }
    await page.waitForTimeout(350);
  }
  throw new Error('Gösterimden gözden geçirmeye geçilemedi');
}

test('lig modunda 1 turluk tam oyun: 3 oyuncu + seyirci + ortak ekran', async ({ browser }) => {
  test.setTimeout(420_000);
  const lobby: GameLobby = await createLobby(SELECTION_SETTINGS);
  try {
    await lobby.manager.view();
    const code = lobby.code;

    // Ortak ekran: eşleştirme kodu → /ekran → "Ekranı başlat"
    const pair = await createDisplayPairCode(lobby.manager);
    const displayContext = await browser.newContext();
    const display = await displayContext.newPage();
    await display.setViewportSize({ width: 1280, height: 720 });
    await display.goto(`${WEB}/ekran`);
    await display.getByLabel('Eşleştirme kodu').fill(pair.code);
    await display.getByRole('button', { name: 'Eşleştir' }).click();
    await display.getByRole('button', { name: 'Ekranı başlat' }).click();
    await expect(display.getByText("Oyun kodunu yaz ya da QR'ı okut")).toBeVisible();
    await expect(display.locator('svg').first()).toBeVisible();
    await expect(display.getByText(code)).toBeVisible();
    await expect(display.getByText(/seyirci/)).toBeVisible();

    // 3 oyuncu + 1 seyirci katılır (her biri kendi tarayıcı bağlamında).
    const duman = await joinParticipant(browser, code, 'Duman', 'player');
    const kral = await joinParticipant(browser, code, 'Kral', 'player');
    const sims = await joinParticipant(browser, code, 'Şimşek', 'player');
    const seyirci = await joinParticipant(browser, code, 'İzleyici', 'voter');

    // Lobi sahneleri güncellenir (SPEC 13.1).
    await expect(display.getByText('Duman')).toBeVisible();
    await expect(display.getByText('Kral')).toBeVisible();
    await expect(display.getByText('Şimşek')).toBeVisible();
    await expect(display.getByText('3 oyuncu · 1 seyirci')).toBeVisible();

    // Yönetici başlatır (yardımcı API ile) ve seçim görünümünü yakalar.
    expect((await lobby.manager.command({ type: 'start' })).ok).toBe(true);
    const selectionView = await lobby.manager.view((v) => v.phase.kind === 'selection');
    const promptText = selectionView.view.prompt!.text;

    // Seçim sahnesi: büyük durum + hazır sayacı.
    await expect(display.getByText(promptText)).toBeVisible();
    await expect(display.getByText('oyuncu seçti')).toBeVisible();

    // Oyuncular kütüphaneden meme seçer ve onaylar; seçim erken biter.
    for (const page of [duman.page, kral.page, sims.page]) {
      await expect(page.getByText('Kütüphane yükleniyor…')).toBeHidden();
      const promptText = await page.locator('p.font-display').first().textContent();
      expect(promptText, 'seçim durumu ekranda').toBeTruthy();
      await page.getByRole('button', { name: /Maaş yattı ama kira da yattı/ }).click();
      await page.getByRole('button', { name: 'Seçimimi onayla' }).click();
      await expect(page.getByText('Seçimin onaylandı.')).toBeVisible({ timeout: 5000 });
    }
    await expect(display.getByText('3/3')).toBeVisible({ timeout: 10_000 });

    // Gönderi gösterimi: 3 slot; her sayfada puanlama görünür.
    await Promise.all([
      rateUntilReview(duman.page),
      rateUntilReview(kral.page),
      rateUntilReview(sims.page),
      rateUntilReview(seyirci.page),
    ]);

    // Gösterimde canlı oy sayacı ve "Gönderi n / 3" bilgisi (M3b görünüm alanları).
    // (Sahneler akış içinde zaten işlendi; burada gözden geçirme ekranındayız.)
    for (const page of [duman.page, kral.page, sims.page, seyirci.page])
      await expect(page.getByRole('button', { name: /Bitirdim/ })).toBeVisible();

    // Yeniden bağlanma: Kral sayfasını yenile; aynı kimlikle döner (SPEC 5.5).
    await kral.page.reload();
    await expect(kral.page.getByText('Final gözden geçirme')).toBeVisible({ timeout: 30_000 });
    await expect(kral.page.getByLabel('Takma adın')).toBeHidden();
    await expect(kral.page.getByText('Yeniden bağlanıyor')).toBeHidden();

    // Bitirdim: bağlı tüm uygun puanlayıcılar → aşama kapanır (SPEC 7.3).
    for (const page of [duman.page, sims.page, seyirci.page])
      await page.getByRole('button', { name: /Bitirdim/ }).click().catch(() => undefined);
    await kral.page.getByRole('button', { name: /Bitirdim/ }).click().catch(() => undefined);

    // Sırayla açıklama → sonuç → tablo (SPEC 7.4).
    await expect(display.getByText('tur sonuçları')).toBeVisible({ timeout: 60_000 });
    await expect(display.getByText('Tablo').or(display.getByLabel('Tablo'))).toBeVisible({
      timeout: 30_000,
    });
    await expect(duman.page.getByText('Sonuçlar açıklanıyor…').or(duman.page.getByRole('heading', { name: /tur sonuçları/ }))).toBeVisible();

    // Lig 1 tur → oyun biter; şampiyon tüm yüzeylerde.
    await expect(duman.page.getByText(/Şampiyon:/)).toBeVisible({ timeout: 60_000 });
    await expect(display.getByText(/Şampiyon:/)).toBeVisible();
    await expect(kral.page.getByText(/Şampiyon:/)).toBeVisible({ timeout: 30_000 });
    await expect(sims.page.getByText(/Şampiyon:/)).toBeVisible({ timeout: 30_000 });
    await expect(seyirci.page.getByText(/Şampiyon:/)).toBeVisible({ timeout: 30_000 });
  } finally {
    lobby.close();
    await browser.close();
  }
});

test('geç katılan seyirci o turu puanlayamaz (SPEC 5.6)', async ({ browser }) => {
  test.setTimeout(240_000);
  const lobby = await createLobby(SELECTION_SETTINGS);
  try {
    await lobby.manager.view();
    const code = lobby.code;

    const duman = await joinParticipant(browser, code, 'Duman', 'player');
    await joinParticipant(browser, code, 'Kral', 'player');
    await lobby.manager.command({ type: 'start' });

    // Gönderi gösterimi başlayana kadar bekle (seçim erken bitebilir ya da süresi dolar).
    await duman.page.getByText('Gönderi 1 / 2').or(duman.page.getByText(/Son karar!/)).or(
      duman.page.locator('button[role="radio"]:not([disabled])'),
    ).first().waitFor({ timeout: 60_000 });
    expect(duman.page.url()).toContain('/oda/');

    // Gösterim sürerken seyirci katılır.
    const gec = await joinParticipant(browser, code, 'Geç', 'voter');
    await expect(gec.page.getByText('Bu gönderiyi puanlayamazsın.')).toBeVisible({
      timeout: 30_000,
    });

    // Final gözden geçirmede de puanlama kapalıdır (kilitli gönderiler metinle gösterilir).
    await duman.page.getByText('Final gözden geçirme').waitFor({ timeout: 60_000 });
    await expect(gec.page.getByText('Final gözden geçirme')).toBeVisible({ timeout: 30_000 });
    await expect(
      gec.page.getByText('Bu gönderiyi puanlayamazsın.').or(gec.page.getByText('Gizlendi; puanlanamaz.')).first(),
    ).toBeVisible();
    await expect(gec.page.locator('button[role="radio"]:not([disabled])')).toHaveCount(0);
  } finally {
    lobby.close();
    await browser.close();
  }
});

test('cihaz devri: aynı ad, yönetici onayı, eski cihaz düşer (SPEC 5.5)', async ({ browser }) => {
  const lobby = await createLobby(SELECTION_SETTINGS);
  try {
    await lobby.manager.view();
    const code = lobby.code;

    const first = await joinParticipant(browser, code, 'Ali', 'player');

    // Yeni cihaz aynı adla girer: "Sen misin?" teklifi çıkar.
    const secondContext = await browser.newContext();
    const second = await secondContext.newPage();
    await second.setViewportSize({ width: 390, height: 844 });
    await second.goto(`${WEB}/oda/${code}`);
    await second.getByLabel('Takma adın').fill('Ali');
    await second.getByRole('button', { name: 'Odaya gir' }).click();
    await expect(second.getByText('Bu ad sen misin?')).toBeVisible();
    await second.getByRole('button', { name: 'Devam için yöneticiden onay iste' }).click();
    await expect(second.getByText('Devam onayı bekleniyor')).toBeVisible();

    // Yönetici onaylar.
    const pending = await lobby.manager.shellInfo((s) => s.pendingTakeovers.length > 0);
    expect(
      (await lobby.manager.shell({ kind: 'approveTakeover', requestId: pending.pendingTakeovers[0]!.requestId })).ok,
    ).toBe(true);

    // Yeni cihaz lobiye geçer; eski cihazın bağlantısı düşer.
    await expect(second.getByRole('heading', { name: 'Hazırsın, Ali' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(first.page.getByText('Bağlılık başka cihaza geçti')).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    lobby.close();
    await browser.close();
  }
});
