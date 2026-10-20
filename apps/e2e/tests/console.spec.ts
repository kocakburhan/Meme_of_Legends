import { expect, test, type Browser } from '@playwright/test';
import { createBusinessAndLobby, WEB } from '../helpers/driver';

/**
 * M4b uçtan uca (görev kapsamı 4): API ile işletme + lobi; arayüzden işletme
 * girişi; konsoldan ayar değiştirme; ortak ekran eşleştirme; katılımcılar
 * (tarayıcı bağlamları) katılır; konsoldan başlatma (hak onayı); gösterimde
 * "Hemen gizle" (1 sn basılı tutma); onaylı oyun bitirme; rövanş.
 */

test.describe.configure({ mode: 'serial' });

const LOBBY_SETTINGS = {
  mode: 'league' as const,
  leagueRounds: 1,
  selectionSeconds: 30,
  reviewSeconds: 15,
};

async function joinPlayer(browser: Browser, code: string, nickname: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${WEB}/oda/${code}`);
  await page.getByLabel('Takma adın').fill(nickname);
  await page.getByRole('button', { name: 'Odaya gir' }).click();
  await expect(page.getByRole('heading', { name: `Hazırsın, ${nickname}` })).toBeVisible();
  return { context, page };
}

test('konsol: giriş → ayar → eşleştirme → başlat → Hemen gizle → bitir → rövanş', async ({ browser }) => {
  test.setTimeout(420_000);
  const lobby = await createBusinessAndLobby(LOBBY_SETTINGS);
  const contexts: Awaited<ReturnType<Browser['newContext']>>[] = [];
  try {
    // Arayüzden işletme girişi; panel ana sayfası hesabı gösterir.
    const manager = await browser.newContext();
    contexts.push(manager);
    const page = await manager.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB}/isletme/giris`);
    await page.getByLabel('Kullanıcı adı').fill(lobby.username);
    await page.getByLabel('Şifre').fill(lobby.password);
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page).toHaveURL(/\/isletme$/);
    await expect(page.getByRole('heading', { name: 'Anka Kafe' })).toBeVisible();

    // "Aktif oturumlar" listesinden konsola dön (M4c paneli: "Oyuna dön").
    await page.getByRole('button', { name: 'Oyuna dön' }).click();
    await expect(page).toHaveURL(new RegExp(`/isletme/oyun/${lobby.code}$`));
    const gameTab = page.locator('#console-game');
    const participantsTab = page.locator('#console-participants');
    const settingsTab = page.locator('#console-settings');
    await expect(page.getByText(`Oda ${lobby.code}`)).toBeVisible();
    // Koşullar sağlanmazsa Başlat pasif: henüz oyuncu yok.
    await expect(gameTab.getByRole('button', { name: 'Başlat' })).toBeDisabled();

    // Görevin düzen isteği: 360×740'ta kırılmaz.
    await page.setViewportSize({ width: 360, height: 740 });
    await expect(gameTab.getByRole('button', { name: 'Başlat' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });

    // Konsoldan ayar değiştir (lobi): seçim süresi +5 sn, mod Eleme.
    await gameTab.getByRole('button', { name: 'Seçim süresi arttır' }).click();
    await expect(gameTab.getByLabel('Seçim süresi', { exact: true })).toHaveValue('35');
    await gameTab.getByRole('radio', { name: 'Eleme' }).click();
    // Mod açıklaması sunucu görünümünden gelir: ack + yayının kanıtı.
    await expect(gameTab.getByText('Rastgele düellolar; kaybeden elenir, kazanan tur atlar.')).toBeVisible({
      timeout: 10_000,
    });
    await expect(gameTab.getByLabel('Lig tur sayısı', { exact: true })).toBeHidden();

    // Ortak ekran: konsoldan kod üret, /ekran'da eşleştir.
    await page.getByText('Ortak ekran').click();
    await page.getByRole('button', { name: 'Eşleştirme kodu üret' }).click();
    const pairCode = (await page.getByLabel('Eşleştirme kodu').textContent())?.trim() ?? '';
    expect(pairCode).toMatch(/^\d{6}$/);

    const displayContext = await browser.newContext();
    contexts.push(displayContext);
    const display = await displayContext.newPage();
    await display.setViewportSize({ width: 1280, height: 720 });
    await display.goto(`${WEB}/ekran`);
    await display.getByLabel('Eşleştirme kodu').fill(pairCode);
    await display.getByRole('button', { name: 'Eşleştir' }).click();
    await display.getByRole('button', { name: 'Ekranı başlat' }).click();
    await expect(display.getByText("Oyun kodunu yaz ya da QR'ı okut")).toBeVisible();
    await expect(display.getByText(lobby.code)).toBeVisible();

    // Katılımcılar (her biri kendi tarayıcı bağlamında) katılır; konsol listeler.
    const duman = await joinPlayer(browser, lobby.code, 'Duman');
    contexts.push(duman.context);
    const kral = await joinPlayer(browser, lobby.code, 'Kral');
    contexts.push(kral.context);
    await expect(gameTab.getByText('2 oyuncu')).toBeVisible();
    await page.getByRole('button', { name: 'Katılımcılar', exact: true }).click();
    await expect(participantsTab.getByText('Duman')).toBeVisible();
    await expect(participantsTab.getByText('Kral')).toBeVisible();
    await page.getByRole('button', { name: 'Oyun', exact: true }).click();

    // Konsoldan başlat: hak onayı görünür, onaylanınca seçim başlar.
    await gameTab.getByRole('button', { name: 'Başlat' }).click();
    await expect(page.getByText(/1 oyun hakkın düşecek/)).toBeVisible();
    await page.getByRole('button', { name: 'Evet, başlat', exact: true }).click();
    await expect(page.getByText('Tur 1 · Seçim')).toBeVisible({ timeout: 15_000 });
    await expect(display.getByText('oyuncu seçti')).toBeVisible({ timeout: 15_000 });

    // Oyuncular kütüphaneden seçip onaylar; seçim erken biter → gösterim.
    for (const player of [duman.page, kral.page]) {
      await expect(player.getByText('Kütüphane yükleniyor…')).toBeHidden();
      await player.getByRole('button', { name: /Maaş yattı ama kira da yattı/ }).click();
      await player.getByRole('button', { name: 'Seçimimi onayla' }).click();
    }
    await expect(gameTab.getByText('Gönderi 1 / 2')).toBeVisible({ timeout: 15_000 });

    // Hemen gizle: 1 sn basılı tutma (SPEC 12.5); klavye yoluyla.
    const hide = page.getByRole('button', { name: /Hemen gizle/ });
    await hide.focus();
    await page.keyboard.down(' ');
    await page.waitForTimeout(1400);
    await page.keyboard.up(' ');
    await expect(gameTab.getByText('Gizlenenler')).toBeVisible({ timeout: 10_000 });

    // Oyunu bitir (onaylı) — Ayarlar sekmesi; masaüstünde sütun görünür.
    await page.setViewportSize({ width: 1280, height: 800 });
    await settingsTab.getByRole('button', { name: 'Oyunu bitir' }).click();
    await expect(page.getByText('Oyun şimdi sona erer')).toBeVisible();
    await page.getByRole('button', { name: 'Evet, bitir', exact: true }).click();
    await expect(gameTab.getByRole('button', { name: 'Rövanş' })).toBeVisible({ timeout: 15_000 });

    // Rövanş: aynı odada yeni lobi; değiştirilen ayarlar taşınır, Başlat
    // 0 oyuncuyla pasif ve nedeni görünür.
    await gameTab.getByRole('button', { name: 'Rövanş' }).click();
    await expect(page.getByText('Lobi', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(gameTab.getByText('Başlat pasif: En az 2 oyuncu gerek.')).toBeVisible();
    await expect(gameTab.getByLabel('Seçim süresi', { exact: true })).toHaveValue('35');
    await expect(gameTab.getByRole('radio', { name: 'Eleme' })).toBeChecked();

    // Hak başlatınca düştü: 5 → 4; panel ana sayfası gösterir.
    await page.goto(`${WEB}/isletme`);
    await expect(page.getByText('Oyun hakkı')).toBeVisible();
    await expect(page.getByText('4', { exact: true })).toBeVisible();
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined);
  }
});
