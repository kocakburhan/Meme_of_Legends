import { expect, test, type Page } from '@playwright/test';
import { createBusiness, createBusinessAndLobby, SERVER, WEB } from '../helpers/driver';
import { E2E_ADMIN } from '../global-setup';

/**
 * M5c-2 uçtan uca: İçerik bölümü — İşletmeler'deki arama alanının düzgün tek
 * kutu olması ve arama, platform durumu ekle/tekrar/arşivle/yeniden
 * etkinleştir, kategori ekle/sırala/adlandır/arşivle, işletme durumunu
 * engelle/engeli kaldır, API ile multipart yüklenen etiketlenmemiş meme'in
 * hızlı etiketlemede kaydedilip oda kütüphanesinde görünmesi ve kütüphane
 * listesi (arama, filtre, arşiv/geri al).
 *
 * Dosya adı gereği admin.spec'ten ÖNCE çalışır; platformun aktif durum sayısı
 * (admin.spec "az: 6" der) ve etiketsiz kuyruk boşalarak bitirilir.
 */

test.describe.configure({ mode: 'serial' });

const rand = (): string => crypto.randomUUID().slice(0, 8);

async function adminLogin(page: Page): Promise<void> {
  await page.goto(`${WEB}/admin/giris`);
  await page.getByLabel('Kullanıcı adı').fill(E2E_ADMIN.username);
  await page.getByLabel('Şifre').fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Admin oturum çerezini API ile alır (kurulum istekleri için). */
async function adminCookie(): Promise<string> {
  const res = await fetch(`${SERVER}/api/auth/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(E2E_ADMIN),
  });
  if (!res.ok) throw new Error(`admin login → ${res.status}`);
  return res.headers.getSetCookie()[0]!.split(';')[0]!;
}

/** Benzersiz adlı işletme açar ve işletme oturum çerezini döner. */
async function createNamedBusiness(name: string): Promise<{ name: string; username: string; cookie: string }> {
  const username = `anka-${rand()}`;
  const created = await fetch(`${SERVER}/api/admin/businesses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: await adminCookie() },
    body: JSON.stringify({ name, username, credits: 5, password: 'anka-kafe-pass-123' }),
  });
  if (!created.ok) throw new Error(`business create → ${created.status} ${await created.text()}`);
  const login = await fetch(`${SERVER}/api/auth/business/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'anka-kafe-pass-123' }),
  });
  if (!login.ok) throw new Error(`business login → ${login.status}`);
  return {
    name,
    username,
    cookie: login.headers.getSetCookie()[0]!.split(';')[0]!,
  };
}

/** Yarım kalmış önceki çalışmanın e2e platform durumlarını arşivler. */
async function archiveLeftoverPlatformPrompts(): Promise<void> {
  const cookie = await adminCookie();
  const res = await fetch(`${SERVER}/api/admin/prompts?status=all&limit=100`, {
    headers: { cookie },
  });
  const data = (await res.json()) as { prompts: { id: string; text: string; status: string }[] };
  for (const prompt of data.prompts) {
    if (prompt.text.startsWith('e2e platform durumu') && prompt.status === 'active') {
      await fetch(`${SERVER}/api/admin/prompts/${prompt.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ status: 'archived' }),
      });
    }
  }
}

/** Kuyruğu boşaltır (yarım kalmış önceki çalışmanın etiketsizleri arşivlenir). */
async function archiveUntaggedMemes(): Promise<void> {
  const cookie = await adminCookie();
  const res = await fetch(`${SERVER}/api/admin/memes?status=untagged&order=oldest&limit=100`, {
    headers: { cookie },
  });
  const data = (await res.json()) as { memes: { id: string }[] };
  for (const meme of data.memes) {
    await fetch(`${SERVER}/api/admin/memes/${meme.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ status: 'archived' }),
    });
  }
}

/** Medya ucundan tohum PNG alıp etiketsiz sistem meme'i olarak yükler. */
async function uploadUntaggedMeme(): Promise<{ id: string }> {
  const png = new Uint8Array(
    await (await fetch(`${SERVER}/media/memes/m-e2e-0/media.png`)).arrayBuffer(),
  );
  const form = new FormData();
  form.set('file', new Blob([png], { type: 'image/png' }), 'meme.png');
  form.set('meta', JSON.stringify({ mediaType: 'image' }));
  const res = await fetch(`${SERVER}/api/admin/memes`, {
    method: 'POST',
    headers: { cookie: await adminCookie() },
    body: form,
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { meme: { id: string } }).meme;
}

test('işletmeler: arama alanı düzgün tek kutudur ve arama çalışır', async ({ browser }) => {
  const business = await createBusiness();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await adminLogin(page);
    await page.goto(`${WEB}/admin/isletmeler`);

    // Düzeltilen düzen: giriş geniş, "Ara" düğmesi içerik genişliğinde kalır.
    const input = page.getByLabel('Ara', { exact: true });
    await expect(input).toBeVisible();
    const inputBox = (await input.boundingBox())!;
    const buttonBox = (await page.getByRole('button', { name: 'Ara' }).boundingBox())!;
    expect(inputBox.width).toBeGreaterThan(200);
    expect(buttonBox.width).toBeLessThan(inputBox.width / 2);

    // Arama kullanıcı adında benzersiz eşleşir; tek satır döner.
    await input.fill(business.username);
    await page.getByRole('button', { name: 'Ara' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: business.username })).toHaveCount(1);
  } finally {
    await context.close().catch(() => undefined);
  }
});

test('içerik: platform durumu ekle, tekrar, arşivle, yeniden etkinleştir', async ({ browser }) => {
  await archiveLeftoverPlatformPrompts();
  const text = `e2e platform durumu ${rand()}`;
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await adminLogin(page);
    await page.goto(`${WEB}/admin/icerik/durumlar`);

    // Azlık uyarısı: tohumda 6 aktif durum < 30 eşiği.
    await expect(page.getByRole('note', { name: 'Platform durumu sayısı' })).toContainText(
      'Platform durumları az: 6',
    );

    // Canlı sayaç sayar; ekleme listeye düşer.
    await page.getByLabel('Yeni durum').fill(text);
    await expect(page.getByText(`${[...text].length}/160`)).toBeVisible();
    const row = page.getByRole('listitem').filter({ hasText: text });
    await page.getByRole('button', { name: 'Ekle' }).click();
    await expect(row).toBeVisible();

    // Aktif çakışma: "zaten var", yeniden etkinleştirme önerilmez.
    await page.getByLabel('Yeni durum').fill(text);
    await page.getByRole('button', { name: 'Ekle' }).click();
    await expect(page.getByRole('alert')).toContainText('Bu durum zaten var.');
    await expect(
      page.getByRole('alert').getByRole('button', { name: 'Yeniden etkinleştir' }),
    ).toHaveCount(0);

    // Arşivle; arşivdeki kayıtla tekrar bu kez "Yeniden etkinleştir" önerir.
    await row.getByRole('button', { name: 'Arşivle' }).click();
    await expect(row.getByText('Arşivli')).toBeVisible();
    await page.getByLabel('Yeni durum').fill(text);
    await page.getByRole('button', { name: 'Ekle' }).click();
    await expect(page.getByRole('alert')).toContainText('Bu durum zaten var.');
    await page
      .getByRole('form', { name: 'Platform durumu ekle' })
      .getByRole('button', { name: 'Yeniden etkinleştir' })
      .click();
    await expect(row.getByText('Arşivli')).toBeHidden();

    // Kapanışta yeniden arşivlenir; aktif sayı tohum düzeyine döner.
    await row.getByRole('button', { name: 'Arşivle' }).click();
    await expect(row.getByText('Arşivli')).toBeVisible();
  } finally {
    await context.close().catch(() => undefined);
  }
});

test('içerik: kategori ekle, sırala, yeniden adlandır, arşivle', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const first = `E2E Kategori ${rand()}`;
  const second = `E2E Kategori İkincisi ${rand()}`;
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await adminLogin(page);
    await page.goto(`${WEB}/admin/icerik/kategoriler`);

    // Tohum kategorisi görünür; yeniler sona eklenir.
    await expect(page.getByRole('listitem').filter({ hasText: 'Genel' })).toBeVisible();
    const firstRow = page.getByRole('listitem').filter({ hasText: first });
    const secondRow = page.getByRole('listitem').filter({ hasText: second });
    await page.getByLabel('Kategori adı').fill(first);
    await page.getByRole('button', { name: 'Ekle' }).click();
    await expect(firstRow).toBeVisible();
    await page.getByLabel('Kategori adı').fill(second);
    await page.getByRole('button', { name: 'Ekle' }).click();
    await expect(secondRow).toBeVisible();

    // Sırala: ikinciyi yukarı taşı; liste sırası güncellenir.
    await secondRow.getByRole('button', { name: `${second}: yukarı taşı` }).click();
    await expect(async () => {
      const order = await page.getByRole('listitem').allTextContents();
      expect(order.findIndex((t) => t.includes(second))).toBeLessThan(
        order.findIndex((t) => t.includes(first)),
      );
    }).toPass();

    // Yeniden adlandır.
    await secondRow.getByRole('button', { name: 'Düzenle' }).click();
    const renamedName = `E2E Kategori Yenisi ${rand()}`;
    await page.getByLabel('Kategori adını düzenle').fill(renamedName);
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    const renamed = page.getByRole('listitem').filter({ hasText: renamedName });
    await expect(renamed).toBeVisible();

    // Arşivle ve geri al.
    await renamed.getByRole('button', { name: 'Arşivle' }).click();
    await expect(renamed.getByText('Arşivli')).toBeVisible();
    await renamed.getByRole('button', { name: 'Geri al' }).click();
    await expect(renamed.getByText('Arşivli')).toBeHidden();
  } finally {
    await context.close().catch(() => undefined);
  }
});

test('içerik: işletme durumu engelle ve engeli kaldır', async ({ browser }) => {
  const business = await createNamedBusiness(`Denetim Kafe ${rand()}`);
  const text = `e2e işletme durumu ${rand()}`;
  const created = await fetch(`${SERVER}/api/business/prompts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: business.cookie },
    body: JSON.stringify({ text }),
  });
  expect(created.ok).toBe(true);

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await adminLogin(page);
    await page.goto(`${WEB}/admin/icerik/isletme-durumlari`);

    // İşletme seçimi listeyi daraltır; satır işletme adını taşır.
    const businessSelect = page.getByLabel('İşletme', { exact: true });
    await expect(businessSelect.locator('option', { hasText: business.name })).toHaveCount(1);
    await businessSelect.selectOption({ label: business.name });
    const row = page.getByRole('listitem').filter({ hasText: text });
    await expect(row).toContainText(business.name);

    // Engelle: rozet + engeli kaldır düğmesi gelir.
    await row.getByRole('button', { name: 'Engelle' }).click();
    await expect(row.getByText('Engellendi')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Engeli kaldır' })).toBeVisible();

    // Engelli filtresi listeler; engelsizde bu işletmede kayıt yok.
    await page.getByRole('radio', { name: 'Engelli' }).click();
    await expect(row).toBeVisible();
    await page.getByRole('radio', { name: 'Engelsiz' }).click();
    await expect(page.getByText('Engelsiz durum yok.')).toBeVisible();
    await page.getByRole('radio', { name: 'Tümü' }).click();

    // Metin araması aynı satırı bulur; Temizle sorguyu boşaltır.
    await page.getByLabel('Ara', { exact: true }).fill(text);
    await page.getByRole('button', { name: 'Ara' }).click();
    await expect(row).toBeVisible();
    await page.getByRole('button', { name: 'Temizle' }).click();

    // Engeli kaldır.
    await row.getByRole('button', { name: 'Engeli kaldır' }).click();
    await expect(row.getByText('Engellendi')).toBeHidden();
  } finally {
    await context.close().catch(() => undefined);
  }
});

test('içerik: hızlı etiketleme kaydeder; meme oda kütüphanesinde görünür', async ({ browser }) => {
  await archiveUntaggedMemes();
  const meme = await uploadUntaggedMeme();

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await adminLogin(page);
    await page.goto(`${WEB}/admin/icerik/etiketle`);

    // Büyük önizleme gerçek medyayı gösterir.
    const preview = page.getByRole('img', { name: 'Etiketlenmemiş meme' });
    await expect(preview).toBeVisible();
    expect(await preview.getAttribute('src')).toContain('/media/memes/');

    // Kısayollar: seçenekler gelince 1 → kategori, doldur, Ctrl+Enter → kaydet.
    await expect
      .poll(() => page.getByLabel('Kategori').locator('option').count())
      .toBeGreaterThan(1);
    await page.keyboard.press('1');
    await expect(page.getByLabel('Kategori')).toHaveValue('cat-e2e-genel');
    const description = `E2E hızlı etiket ${rand()}`;
    await page.getByLabel('Açıklama').fill(description);
    await page.keyboard.press('Control+Enter');

    // Kuyruk boşalır; kayıt aktif etiketle kütüphaneye düşer.
    await expect(page.getByText('Etiketlenecek içerik kalmadı.')).toBeVisible();

    const lobby = await createBusinessAndLobby({});
    const library = await fetch(`${SERVER}/api/rooms/${lobby.code}/library`, {
      headers: { cookie: lobby.businessCookie },
    });
    expect(library.ok).toBe(true);
    const data = (await library.json()) as { memes: { id: string; title: string }[] };
    expect(data.memes.find((m) => m.id === meme.id)?.title).toBe(description);
  } finally {
    await context.close().catch(() => undefined);
  }
});

test('içerik: kütüphane listesi, arama, etiket düzenleme ve arşiv', async ({ browser }) => {
  await archiveUntaggedMemes();
  const meme = await uploadUntaggedMeme();
  const description = `E2E kütüphane meme ${rand()}`;

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await adminLogin(page);
    await page.goto(`${WEB}/admin/icerik/kutuphane`);

    // Panelde ekleme yoktur; yerel araç işaret edilir.
    await expect(page.getByText('Panelde ekleme yoktur')).toBeVisible();

    // Etiketsiz filtresinde yeni yüklenen meme gerçek önizlemeyle görünür.
    await page.getByRole('radio', { name: 'Etiketsiz' }).click();
    const row = page.getByRole('listitem').filter({
      has: page.locator(`img[src*="${meme.id}"]`),
    });
    await expect(row).toBeVisible();

    // Kategori + açıklama verip kaydeder; kayıt etiketsiz kalır.
    await row.getByRole('button', { name: 'Düzenle' }).click();
    await row.getByLabel('Kategori').selectOption({ label: 'Genel' });
    await row.getByLabel('Açıklama').fill(description);
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    const tagged = page.getByRole('listitem').filter({ hasText: description });
    await expect(tagged).toBeVisible();
    await expect(tagged.getByText('Etiketlenmemiş')).toBeVisible();

    // Arama açıklamada benzersiz bulur.
    await page.getByLabel('Ara', { exact: true }).fill(description);
    await page.getByRole('button', { name: 'Ara' }).click();
    await expect(page.getByRole('listitem')).toHaveCount(1);

    // Arşivle: etiketsiz listeden düşer; arşiv filtresinde görünür.
    await tagged.getByRole('button', { name: 'Arşivle' }).click();
    await expect(tagged).toHaveCount(0);
    await page.getByRole('radio', { name: 'Arşiv' }).click();
    const archived = page.getByRole('listitem').filter({ hasText: description });
    await expect(archived.getByText('Arşivli')).toBeVisible();

    // Geri al: etiketli kayıt aktifleşir; arşiv listesinden düşer.
    await archived.getByRole('button', { name: 'Geri al' }).click();
    await expect(archived).toHaveCount(0);
    await page.getByRole('radio', { name: 'Aktif' }).click();
    const active = page.getByRole('listitem').filter({ hasText: description });
    await expect(active.getByText('Aktif')).toBeVisible();
  } finally {
    await context.close().catch(() => undefined);
  }
});
