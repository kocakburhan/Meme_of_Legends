import { expect, test, type Browser, type Page } from '@playwright/test';
import type { SessionReport, SessionSummary } from '@mol/shared';
import {
  createLobby,
  joinViaApi,
  playQuickLeagueGame,
  SERVER,
  WEB,
  type ApiJoin,
  type GameLobby,
} from '../helpers/driver';

/**
 * M4c-3 uçtan uca: Geçmiş + detay. Kısa lig oyunu API+WS yardımcısıyla
 * oynatılır (tarayıcısız); biten oturum panelden görülür: boş geçmiş →
 * liste → detay (mod, tarih, süre, katılımcılar, şampiyon, sıralama, jüri,
 * gizlenen gönderi, bitiş nedeni) → Geçmişe dön; masaüstünde yan menü.
 */

test.describe.configure({ mode: 'serial' });

async function loginViaUi(page: Page, username: string, password: string): Promise<void> {
  await page.goto(`${WEB}/isletme/giris`);
  await page.getByLabel('Kullanıcı adı').fill(username);
  await page.getByLabel('Şifre').fill(password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/isletme$/);
}

interface SessionDetail {
  session: SessionSummary;
  report: SessionReport | null;
}

test('geçmiş: boş liste → kısa oyun (API+WS) → liste → detay alanları', async ({ browser }) => {
  test.setTimeout(420_000);
  const lobby: GameLobby = await createLobby({
    mode: 'league',
    leagueRounds: 1,
    selectionSeconds: 30,
    reviewSeconds: 15,
  });
  const contexts: Awaited<ReturnType<Browser['newContext']>>[] = [];
  let duman: ApiJoin | null = null;
  let kral: ApiJoin | null = null;
  try {
    // Boş geçmiş: panelde Geçmiş sayfası boş notuyla açılır.
    const context = await browser.newContext();
    contexts.push(context);
    const page = await context.newPage();
    page.on('pageerror', (err) => console.log('PAGEERROR', err.message.slice(0, 200)));
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, lobby.username, lobby.password);
    await page.getByRole('link', { name: 'Geçmiş', exact: true }).click();
    await expect(page).toHaveURL(/\/isletme\/gecmis$/);
    await expect(page.getByText('Henüz bitmiş oyun yok.')).toBeVisible();

    // Kısa oyun: 2 oyuncu API+WS ile oynanır; oyun 'finished' olur.
    duman = await joinViaApi(lobby.code, 'Duman');
    kral = await joinViaApi(lobby.code, 'Kral');
    await playQuickLeagueGame(lobby, [duman, kral]);

    // Bitmiş oturum geçmişe düşer (D1 yazımı); detayı raporla birlikte al.
    const holder: { detail: SessionDetail | null } = { detail: null };
    await expect
      .poll(
        async () => {
          const res = await fetch(`${SERVER}/api/business/sessions?status=past`, {
            headers: { cookie: lobby.businessCookie },
          });
          if (!res.ok) throw new Error(`past list → ${res.status}`);
          const data = (await res.json()) as { sessions: SessionSummary[] };
          const found = data.sessions.find(
            (s) => s.roomCode === lobby.code && s.status === 'finished',
          );
          if (!found) return 'none';
          const d = await fetch(`${SERVER}/api/business/sessions/${found.id}`, {
            headers: { cookie: lobby.businessCookie },
          });
          if (!d.ok) throw new Error(`session detail → ${d.status}`);
          holder.detail = (await d.json()) as SessionDetail;
          return 'ready';
        },
        { timeout: 30_000 },
      )
      .toBe('ready');
    const detail = holder.detail;
    if (!detail) throw new Error('detay alınamadı');
    const { session, report } = detail;
    expect(report).not.toBeNull();
    const champion = report!.standings[0]!.nickname;
    expect(session.champion).toBe(champion);

    // Liste: biten oyun satırı; yenile gerekir (sayfa oyundan önce açıldı).
    await page.reload();
    const row = page.getByRole('link', { name: new RegExp(`Oda ${lobby.code}`) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toHaveText(/Bitti/);
    await expect(row).toHaveText(/Lig/);
    await expect(row).toHaveText(new RegExp(`Şampiyon: ${champion}`));

    // Detay: satır tıklaması rapor sayfasına gider.
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/isletme/gecmis/${session.id}$`));
    const summary = page.getByLabel('Oyun özeti');
    await expect(summary.getByText(`Oda ${lobby.code}`)).toBeVisible();
    await expect(summary.getByText('Bitti')).toBeVisible();
    await expect(summary.getByText('Lig', { exact: true })).toBeVisible();
    await expect(summary.getByText('Oyun tamamlandı')).toBeVisible();
    await expect(summary.getByText('2 oyuncu · 0 seyirci')).toBeVisible();
    // Süre gerçek: başlangıç–bitiş farkı "dk"/"sn" biçiminde.
    await expect(summary.getByText(/dk|sn/)).toBeVisible();
    await expect(summary.getByText(champion)).toBeVisible();

    // Sıralama: API raporuyla aynı ad ve puanlar (Türkçe ondalık).
    const standings = page.getByLabel('Sıralama');
    for (const entry of report!.standings) {
      await expect(standings.getByText(entry.nickname)).toBeVisible();
      await expect(
        standings.getByText(
          entry.score.toLocaleString('tr-TR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
        ),
      ).toBeVisible();
    }

    // Jüri ve gizlenen içerik: 1 turda jüri oyu oluşmaz; gizlenen 0.
    await expect(page.getByText('Bu oyunda jüri ödülü verilmedi.')).toBeVisible();
    await expect(page.getByLabel('İçerik durumu').getByText('0', { exact: true })).toBeVisible();

    // Geçmişe dön bağlantısı listeye döner.
    await page.getByRole('link', { name: '← Geçmişe dön' }).click();
    await expect(page).toHaveURL(/\/isletme\/gecmis$/);
    await expect(page.getByRole('link', { name: new RegExp(`Oda ${lobby.code}`) })).toBeVisible();

    // Masaüstünde yan menü görünür, alt gezinme gizlenir.
    await page.setViewportSize({ width: 1280, height: 800 });
    const menu = page.getByRole('complementary', { name: 'Panel menü' });
    await expect(menu.getByRole('link', { name: 'Geçmiş' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Panel menü' })).toBeHidden();
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined);
    duman?.client.close();
    kral?.client.close();
    lobby.close();
  }
});

test('geçmiş sayfalama: 21 oyun "Daha fazla" ile ikiye bölünür (API ile tohum)', async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const lobby = await createLobby({
    mode: 'league',
    leagueRounds: 1,
    selectionSeconds: 30,
    reviewSeconds: 15,
  });
  const contexts: Awaited<ReturnType<Browser['newContext']>>[] = [];
  try {
    // createLobby'un lobisini iptal et: eşzamanlı sınır 1'dir; her yeni lobi
    // ancak açık oturum yokken açılır. İptal edilen lobiler geçmişe düşer.
    const first = await fetch(`${SERVER}/api/business/sessions/${lobby.sessionId}/cancel`, {
      method: 'POST',
      headers: { cookie: lobby.businessCookie },
    });
    if (!first.ok) throw new Error(`cancel → ${first.status} ${await first.text()}`);

    // 20 iptal edilmiş lobi daha: createLobby'nin iptal edileni ile toplam 21
    // bitmiş kayıt olur (API ile hızlı).
    for (let i = 0; i < 20; i++) {
      const created = await fetch(`${SERVER}/api/business/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: lobby.businessCookie },
        body: JSON.stringify({}),
      });
      if (!created.ok) throw new Error(`session create → ${created.status}`);
      const { session } = (await created.json()) as { session: { id: string } };
      const cancelled = await fetch(`${SERVER}/api/business/sessions/${session.id}/cancel`, {
        method: 'POST',
        headers: { cookie: lobby.businessCookie },
      });
      if (!cancelled.ok) throw new Error(`cancel → ${cancelled.status}`);
    }

    const context = await browser.newContext();
    contexts.push(context);
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, lobby.username, lobby.password);
    await page.getByRole('link', { name: 'Geçmiş', exact: true }).click();
    await expect(page).toHaveURL(/\/isletme\/gecmis$/);

    await expect(page.getByRole('link', { name: /Oda [A-HJ-NP-Z2-9]{6}/ })).toHaveCount(20, {
      timeout: 20_000,
    });
    await page.getByRole('button', { name: 'Daha fazla' }).click();
    await expect(page.getByRole('link', { name: /Oda [A-HJ-NP-Z2-9]{6}/ })).toHaveCount(21);
    await expect(page.getByRole('button', { name: 'Daha fazla' })).toBeHidden();
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined);
    lobby.close();
  }
});
