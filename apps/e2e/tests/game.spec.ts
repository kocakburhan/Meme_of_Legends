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
  { awaitReady = true }: { awaitReady?: boolean } = {},
): Promise<{ context: Awaited<ReturnType<Browser['newContext']>>; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (process.env.MOL_E2E_DEBUG) console.log(`[${nickname}]`, msg.type(), msg.text().slice(0, 160));
  });
  page.on('pageerror', (err) => console.log(`[${nickname}] PAGEERROR`, err.message.slice(0, 200)));
  if (process.env.MOL_E2E_DEBUG)
    page.on('websocket', (ws) => {
      console.log(`[${nickname}] WS OPEN`, ws.url());
      ws.on('framereceived', (frame) => {
        try {
          const m = JSON.parse(String(frame.payload)) as {
            type: string;
            seq?: number;
            view?: {
              phase: { kind: string };
              ownSubmission?: { confirmed?: boolean } | null;
              participants: Array<{ id: string }>;
              ownSubmissionId?: string | null;
            };
          };
          if (m.type === 'view' && m.view) {
            const v = m.view;
            console.log(
              `[${nickname}] view seq=${m.seq} phase=${v.phase.kind} own=${v.ownSubmission ? v.ownSubmission.confirmed ? 'confirmed' : 'selected' : 'null'} me=${v.participants.some((p) => p.id === v.ownSubmissionId)}`,
            );
          } else console.log(`[${nickname}]`, m.type, JSON.stringify(m).slice(0, 120));
        } catch {
          /* ignore */
        }
      });
      ws.on('framesent', (frame) => console.log(`[${nickname}] →`, String(frame.payload).slice(0, 140)));
    });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB}/oda/${code}`);
  await page.getByLabel('Takma adın').fill(nickname);
  if (role === 'voter') await page.getByText('Seyirci', { exact: true }).click();
  await page.getByRole('button', { name: 'Odaya gir' }).click();
  // Lobi ekranı yalnız lobby aşamasında görünür; oyun sürerken katılan
  // doğrudan canlı sahneye düşer (awaitReady: false ile atlanır).
  if (awaitReady)
    await expect(page.getByRole('heading', { name: `Hazırsın, ${nickname}` })).toBeVisible();
  return { context, page };
}

/** Slot sırasına göre puan: farklı ortalamalar → net sıralama, uzatma yok. */
const SLOT_SCORES = [5, 3, 2];

async function currentSlotIndex(page: Page): Promise<number> {
  const label = await page.getByText(/Gönderi \d+ \/ \d+/).first().textContent().catch(() => null);
  return Number.parseInt(label?.match(/Gönderi (\d+)/)?.[1] ?? '1', 10);
}

/** Gönderi gösterimi boyunca slota göre bir kez puan verir; gözden geçirmeye geçince döner. */
async function rateUntilReview(page: Page, timeoutMs = 140_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.getByText('Final gözden geçirme').count()) return;
    try {
      const score = SLOT_SCORES[(await currentSlotIndex(page)) - 1] ?? 3;
      const target = page.getByRole('radio', { name: String(score), exact: true });
      // Gösterimde tek puan skalası vardır; birden çok eşleşme (gözden geçirme
      // listesi) puanlama değil bekleme demektir. Kontrol hedef radyodadır;
      // sayfadaki ilk radyoya bakılırsa işaretli puanı sürekli yeniden tıklar.
      if ((await target.count()) === 1 && (await target.getAttribute('aria-checked')) !== 'true')
        await target.click();
    } catch {
      /* Slot geçişi tıklamayı düşürebilir; yeniden denenir. */
    }
    await page.waitForTimeout(350);
  }
  throw new Error('Gösterimden gözden geçirmeye geçilemedi');
}

test('lig modunda 1 turluk tam oyun: 3 oyuncu + seyirci + ortak ekran', async ({ browser }) => {
  test.setTimeout(420_000);
  const lobby: GameLobby = await createLobby(SELECTION_SETTINGS);
  const contexts: Awaited<ReturnType<Browser['newContext']>>[] = [];
  try {
    await lobby.manager.view();
    const code = lobby.code;

    // Ortak ekran: eşleştirme kodu → /ekran → "Ekranı başlat"
    const pair = await createDisplayPairCode(lobby.manager);
    const displayContext = await browser.newContext();
    contexts.push(displayContext);
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
    if (process.env.MOL_E2E_DEBUG) console.log('[test] joining Duman…');
    const duman = await joinParticipant(browser, code, 'Duman', 'player');
    contexts.push(duman.context);
    if (process.env.MOL_E2E_DEBUG) console.log('[test] Duman joined, joining Kral…');
    const kral = await joinParticipant(browser, code, 'Kral', 'player');
    contexts.push(kral.context);
    if (process.env.MOL_E2E_DEBUG) console.log('[test] Kral joined, joining Şimşek…');
    const sims = await joinParticipant(browser, code, 'Şimşek', 'player');
    contexts.push(sims.context);
    if (process.env.MOL_E2E_DEBUG) console.log('[test] Şimşek joined, joining İzleyici…');
    const seyirci = await joinParticipant(browser, code, 'İzleyici', 'voter');
    contexts.push(seyirci.context);
    if (process.env.MOL_E2E_DEBUG) console.log('[test] İzleyici joined; lobi sahneleri kontrol');

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

    // Oyuncular kütüphaneden meme seçer ve onaylar; son onay seçimi erken bitirir.
    for (const page of [duman.page, kral.page, sims.page]) {
      await expect(page.getByText('Kütüphane yükleniyor…')).toBeHidden();
      await page.getByRole('button', { name: /Maaş yattı ama kira da yattı/ }).click();
      await page.getByRole('button', { name: 'Seçimimi onayla' }).click();
      // Onay sonrası ya "Onaylandı ✓" görünür ya da herkes onayladıysa gösterim başlar.
      await expect(
        page
          .getByRole('button', { name: 'Seçimimi onayla' })
          .filter({ hasText: 'Onaylandı ✓' })
          .or(page.getByText(/Gönderi 1 \/ 3/)),
      ).toBeVisible({ timeout: 8000 });
    }
    // Herkes onayladı → seçim erken biter; ortak ekranda gösterim sahnesi başlar.
    await expect(display.getByText(/Gönderi 1 \/ 3/)).toBeVisible({ timeout: 15_000 });

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
    for (const context of contexts) await context.close().catch(() => undefined);
    lobby.close();
  }
});

test('geç katılan seyirci o turu puanlayamaz (SPEC 5.6)', async ({ browser }) => {
  test.setTimeout(240_000);
  const lobby = await createLobby(SELECTION_SETTINGS);
  const contexts: Awaited<ReturnType<Browser['newContext']>>[] = [];
  try {
    await lobby.manager.view();
    const code = lobby.code;

    const duman = await joinParticipant(browser, code, 'Duman', 'player');
    contexts.push(duman.context);
    const kral = await joinParticipant(browser, code, 'Kral', 'player');
    contexts.push(kral.context);
    await lobby.manager.command({ type: 'start' });

    // Kimse seçmezse gösterilecek gönderi yoktur ve tur doğrudan gözden
    // geçirmeye geçer; gösterimi garanti etmek için oyuncular seçip onaylar.
    // Son onay seçimi erken bitirir (SPEC 5.4).
    for (const page of [duman.page, kral.page]) {
      await expect(page.getByText('Kütüphane yükleniyor…')).toBeHidden();
      await page.getByRole('button', { name: /Maaş yattı ama kira da yattı/ }).click();
      await page.getByRole('button', { name: 'Seçimimi onayla' }).click();
    }

    // Gönderi gösterimi başladı.
    await duman.page.getByText('Gönderi 1 / 2').waitFor({ timeout: 30_000 });
    expect(duman.page.url()).toContain('/oda/');

    // Gösterim sürerken seyirci katılır; oyun sürdüğü için lobi ekranı yoktur.
    const gec = await joinParticipant(browser, code, 'Geç', 'voter', { awaitReady: false });
    contexts.push(gec.context);
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
    for (const context of contexts) await context.close().catch(() => undefined);
    lobby.close();
  }
});

test('cihaz devri: aynı ad, yönetici onayı, eski cihaz düşer (SPEC 5.5)', async ({ browser }) => {
  const lobby = await createLobby(SELECTION_SETTINGS);
  const contexts: Awaited<ReturnType<Browser['newContext']>>[] = [];
  try {
    await lobby.manager.view();
    const code = lobby.code;

    const first = await joinParticipant(browser, code, 'Ali', 'player');
    contexts.push(first.context);

    // Yeni cihaz aynı adla girer: "Sen misin?" teklifi çıkar.
    const secondContext = await browser.newContext();
    contexts.push(secondContext);
    const second = await secondContext.newPage();
    await second.setViewportSize({ width: 390, height: 844 });
    await second.goto(`${WEB}/oda/${code}`);
    await second.getByLabel('Takma adın').fill('Ali');
    await second.getByRole('button', { name: 'Odaya gir' }).click();
    await expect(second.getByText('Bu ad sen misin?')).toBeVisible();
    await second.getByRole('button', { name: 'Cihaz devri için onay iste' }).click();
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
    for (const context of contexts) await context.close().catch(() => undefined);
    lobby.close();
  }
});
