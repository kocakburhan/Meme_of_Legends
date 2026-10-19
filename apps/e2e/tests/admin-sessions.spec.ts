import { expect, test, type Page } from '@playwright/test';
import {
  ManagerClient,
  SERVER,
  WEB,
  joinViaApi,
  type ApiJoin,
} from '../helpers/driver';
import { E2E_ADMIN } from '../global-setup';

/**
 * M5c-3 uçtan uca: Oturumlar listesi (işletme + durum filtresi) → detay →
 * aktif oyunu sonlandır → hakkı iade et; işletme bazında kullanım sayfası;
 * Sistem hata kayıtları ve admin işlem kaydı (hedef filtresi). Oturum gerçek
 * oyuncularla başlatılır; böylece iade gerçekten harcanmış hakkı hedefler.
 */

test.describe.configure({ mode: 'serial' });

const rand = (): string => crypto.randomUUID().slice(0, 8);

async function adminCookie(): Promise<string> {
  const response = await fetch(`${SERVER}/api/auth/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(E2E_ADMIN),
  });
  if (!response.ok) throw new Error(`admin login → ${response.status}`);
  return response.headers.getSetCookie()[0]!.split(';')[0]!;
}

async function adminLogin(page: Page): Promise<void> {
  await page.goto(`${WEB}/admin/giris`);
  await page.getByLabel('Kullanıcı adı').fill(E2E_ADMIN.username);
  await page.getByLabel('Şifre').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

interface NamedLobby {
  businessId: string;
  businessName: string;
  businessCookie: string;
  code: string;
  sessionId: string;
}

/** Benzersiz adlı işletme + lobi açar (hak başlatmada düşer). */
async function createNamedLobby(name: string): Promise<NamedLobby> {
  const cookie = await adminCookie();
  const username = `e2e-oturum-${rand()}`;
  const password = 'e2e-oturum-pass-123';
  const created = await fetch(`${SERVER}/api/admin/businesses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name, username, credits: 3, password }),
  });
  if (!created.ok) throw new Error(`business create → ${created.status} ${await created.text()}`);
  const business = (await created.json()) as { business: { id: string } };

  const login = await fetch(`${SERVER}/api/auth/business/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!login.ok) throw new Error(`business login → ${login.status}`);
  const businessCookie = login.headers.getSetCookie()[0]!.split(';')[0]!;

  const lobby = await fetch(`${SERVER}/api/business/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: businessCookie },
    body: JSON.stringify({
      settings: {
        mode: 'league',
        leagueRounds: 1,
        selectionSeconds: 120,
        reviewSeconds: 30,
      },
    }),
  });
  if (!lobby.ok) throw new Error(`lobby create → ${lobby.status} ${await lobby.text()}`);
  const data = (await lobby.json()) as { session: { id: string; roomCode: string } };
  return {
    businessId: business.business.id,
    businessName: name,
    businessCookie,
    code: data.session.roomCode,
    sessionId: data.session.id,
  };
}

test('oturumlar: aktif oyunu sonlandır, hakkı iade et; kullanım ve sistem kayıtları', async ({
  browser,
}) => {
  const name = `E2E Oturum Kafe ${rand()}`;
  const lobby = await createNamedLobby(name);
  const manager = await ManagerClient.connect(lobby.code, lobby.businessCookie);
  const players: ApiJoin[] = [];
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await manager.view((view) => view.phase.kind === 'lobby');
    players.push(await joinViaApi(lobby.code, 'E2E Deniz'));
    players.push(await joinViaApi(lobby.code, 'E2E Ege'));
    for (const player of players) await player.client.view((view) => view.phase.kind === 'lobby');
    expect((await manager.command({ type: 'start' })).ok).toBe(true);
    await manager.view((view) => view.phase.kind === 'selection');

    await page.setViewportSize({ width: 390, height: 844 });
    await adminLogin(page);
    await page.goto(`${WEB}/admin/oturumlar`);

    // İşletme + durum filtresi listeyi daraltır; satır oda kodunu taşır.
    await page.getByLabel('İşletme', { exact: true }).selectOption({ label: name });
    await page.getByLabel('Durum', { exact: true }).selectOption('active');
    const sessionRow = page.getByRole('listitem').filter({ hasText: `Oda ${lobby.code}` });
    await expect(sessionRow).toBeVisible();
    await expect(sessionRow).toContainText('Oyun');
    await expect(sessionRow).toContainText('Hak harcandı');

    // Detay: zaman damgaları, ayarlar, katılımcılar ve kriz araçları.
    await sessionRow.getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/admin/oturumlar/${lobby.sessionId}$`));
    await expect(page.getByRole('heading', { name: `Oda ${lobby.code}` })).toBeVisible();
    await expect(page.getByText('Oyun', { exact: true })).toBeVisible();
    await expect(page.getByText('Harcandı', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Katılımcılar' })).toContainText('E2E Deniz');
    await expect(page.getByRole('region', { name: 'Katılımcılar' })).toContainText('2 oyuncu');

    // Sonlandır (onaylı): durum güncellenir, rapor bölümleri görünür.
    await page.getByRole('button', { name: 'Oturumu sonlandır' }).click();
    await page.getByRole('button', { name: 'Evet, sonlandır' }).click();
    await expect(page.getByText('Oturum sonlandırıldı.', { exact: true })).toBeVisible();
    await expect(page.getByText('Sonlandırıldı', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Turlar' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Sonuç ve sıralama' })).toBeVisible();

    // İade (onaylı): yalnız gerçekten harcanmış hak bir kez geri verilir.
    await page.getByRole('button', { name: 'Hakkı iade et' }).click();
    await page.getByRole('button', { name: 'Evet, iade et' }).click();
    await expect(page.getByText('Hak iade edildi.', { exact: true })).toBeVisible();
    await expect(page.getByText('Bu oturumun hakkı iade edildi.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Hakkı iade et' }),
    ).toHaveCount(0);

    // Sunucu gerçeği: oturum sonlandırıldı ve iade bayrağı açık.
    const cookie = await adminCookie();
    const detailResponse = await fetch(
      `${SERVER}/api/admin/sessions/${lobby.sessionId}`,
      { headers: { cookie } },
    );
    expect(detailResponse.ok).toBe(true);
    const detail = (await detailResponse.json()) as {
      session: { status: string; creditRefunded: boolean; adminIntervention: boolean };
    };
    expect(detail.session.status).toBe('terminated');
    expect(detail.session.creditRefunded).toBe(true);
    expect(detail.session.adminIntervention).toBe(true);

    // İşletme bazında kullanım: bir oturum, bir harcanan, bir iade.
    await page.goto(`${WEB}/admin/oturumlar/kullanim`);
    const usageRow = page.getByRole('listitem').filter({ hasText: name });
    await expect(usageRow).toBeVisible();
    await expect(usageRow).toContainText('1 oturum');
    await expect(usageRow).toContainText('Harcanan 1');
    await expect(usageRow).toContainText('İade 1');

    // Sistem: hata kayıtları boş; işlem kaydı hedef filtresiyle sonlandırma ve
    // iade satırlarını gösterir.
    await page.goto(`${WEB}/admin/sistem`);
    const errorSection = page.getByRole('region', { name: 'Hata kayıtları' });
    await expect(errorSection.getByText('Kayıtlı hata yok.')).toBeVisible();
    const actionFilter = page.getByRole('form', { name: 'İşlem filtresi' });
    await actionFilter.getByLabel('Hedef kimliği').fill(lobby.sessionId);
    await actionFilter.getByRole('button', { name: 'Filtrele' }).click();
    const actionSection = page.getByRole('region', { name: 'Admin işlem kaydı' });
    await expect(actionSection.getByText('Oturum sonlandırıldı', { exact: true })).toBeVisible();
    await expect(actionSection.getByText('Hak iade edildi', { exact: true })).toBeVisible();

    // Masaüstü düzeni: yan menü görünür, yatay taşma yok.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByRole('complementary', { name: 'Admin menü' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  } finally {
    manager.close();
    for (const player of players) player.client.close();
    await context.close().catch(() => undefined);
  }
});
