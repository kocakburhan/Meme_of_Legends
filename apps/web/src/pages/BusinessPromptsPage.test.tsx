import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BusinessPromptsPage from './BusinessPromptsPage';
import type { BusinessPrompt } from '@/net/http';

const http = vi.hoisted(() => ({
  getBusinessMe: vi.fn().mockResolvedValue({
    business: {
      id: 'b1',
      name: 'Anka Kafe',
      username: 'anka',
      credits: 5,
      unlimitedCredits: false,
      concurrentSessionLimit: 1,
      lobbyLifetimeHours: 24,
      active: true,
    },
  }),
  listBusinessPrompts: vi.fn(),
  createBusinessPrompt: vi.fn(),
  updateBusinessPrompt: vi.fn(),
}));

vi.mock('@/net/http', () => ({
  HttpError: class HttpError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      readonly existingId?: string,
    ) {
      super(`${status} ${code}`);
    }
  },
  ...http,
}));

const TEXT = 'Kahve soğuduktan sonraki hayat';

function prompt(over: Partial<BusinessPrompt>): BusinessPrompt {
  return {
    id: 'p1',
    text: TEXT,
    status: 'active',
    adminBlocked: false,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/isletme/durumlar']}>
      <BusinessPromptsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  http.listBusinessPrompts.mockResolvedValue({ prompts: [], nextCursor: null });
  http.createBusinessPrompt.mockResolvedValue({ prompt: prompt({}) });
  http.updateBusinessPrompt.mockResolvedValue({ prompt: prompt({}) });
});

describe('BusinessPromptsPage', () => {
  it('boş listede boş durum notunu gösterir', async () => {
    renderPage();
    expect(await screen.findByText('Henüz durum yok; yukarıdan ekle.')).toBeVisible();
    expect(http.listBusinessPrompts).toHaveBeenCalledWith({ q: '', status: 'active', limit: 50 });
  });

  it('canlı sayaç gösterir; kısa metinde hata verir ve ağ çağrısı yapmaz', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = await screen.findByLabelText('Yeni durum');
    await user.type(input, 'ab');

    expect(screen.getByText('2/160')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Ekle' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Durum 3–160 karakter olmalı; link ve HTML kabul edilmez.',
    );
    expect(screen.getByText('İpucu: Nokta sonrası boşluk bırak.')).toBeVisible();
    expect(http.createBusinessPrompt).not.toHaveBeenCalled();
  });

  it('link içeren metni şemayla reddeder', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText('Yeni durum'), 'bakın https://ornek.com');
    await user.click(screen.getByRole('button', { name: 'Ekle' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Durum 3–160 karakter olmalı; link ve HTML kabul edilmez.',
    );
    expect(http.createBusinessPrompt).not.toHaveBeenCalled();
  });

  it('durum ekler, formu temizler ve listeyi tazeler', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText('Yeni durum'), TEXT);
    await user.click(screen.getByRole('button', { name: 'Ekle' }));

    await waitFor(() => expect(http.createBusinessPrompt).toHaveBeenCalledWith(TEXT));
    await waitFor(() => expect(http.listBusinessPrompts).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Yeni durum')).toHaveValue('');
  });

  it('tekrarda "Bu durum zaten var" der; aktif çakışmada düğme önermez', async () => {
    const user = userEvent.setup();
    const { HttpError } = (await import('@/net/http')) as unknown as {
      HttpError: new (status: number, code: string, existingId?: string) => Error;
    };
    http.createBusinessPrompt.mockRejectedValue(new HttpError(409, 'PROMPT_DUPLICATE', 'p1'));
    // Tekrar araması (status: 'all') çakışan kaydı aktif olarak döner.
    http.listBusinessPrompts.mockImplementation((opts: { status?: string } | undefined) =>
      opts?.status === 'all'
        ? Promise.resolve({ prompts: [prompt({})], nextCursor: null })
        : Promise.resolve({ prompts: [], nextCursor: null }),
    );
    renderPage();
    await user.type(await screen.findByLabelText('Yeni durum'), TEXT);
    await user.click(screen.getByRole('button', { name: 'Ekle' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Bu durum zaten var.');
    expect(screen.queryByRole('button', { name: 'Yeniden etkinleştir' })).toBeNull();
  });

  it('arşivli çakışmada "Yeniden etkinleştir" önerir ve etkinleştirir', async () => {
    const user = userEvent.setup();
    const { HttpError } = (await import('@/net/http')) as unknown as {
      HttpError: new (status: number, code: string, existingId?: string) => Error;
    };
    http.createBusinessPrompt.mockRejectedValue(new HttpError(409, 'PROMPT_DUPLICATE', 'p1'));
    http.listBusinessPrompts.mockImplementation((opts: { status?: string } | undefined) =>
      opts?.status === 'all'
        ? Promise.resolve({ prompts: [prompt({ status: 'archived' })], nextCursor: null })
        : Promise.resolve({ prompts: [], nextCursor: null }),
    );
    renderPage();
    await user.type(await screen.findByLabelText('Yeni durum'), TEXT);
    await user.click(screen.getByRole('button', { name: 'Ekle' }));

    await screen.findByRole('alert');
    await user.click(await screen.findByRole('button', { name: 'Yeniden etkinleştir' }));

    await waitFor(() =>
      expect(http.updateBusinessPrompt).toHaveBeenCalledWith('p1', { status: 'active' }),
    );
  });

  it('engelli duruma rozet ve açıklama koyar', async () => {
    http.listBusinessPrompts.mockResolvedValue({
      prompts: [prompt({ adminBlocked: true })],
      nextCursor: null,
    });
    renderPage();

    expect(await screen.findByText('Engellendi')).toBeVisible();
    expect(screen.getByText('Platform tarafından engellendi; oyunlarda çıkmaz.')).toBeVisible();
  });

  it('satırdan arşivler', async () => {
    const user = userEvent.setup();
    http.listBusinessPrompts.mockResolvedValue({
      prompts: [prompt({})],
      nextCursor: null,
    });
    renderPage();
    await screen.findByText(TEXT);

    await user.click(screen.getByRole('button', { name: 'Arşivle' }));
    await waitFor(() =>
      expect(http.updateBusinessPrompt).toHaveBeenCalledWith('p1', { status: 'archived' }),
    );
  });

  it('arşivli durumu listeden geri getirir', async () => {
    const user = userEvent.setup();
    http.listBusinessPrompts.mockResolvedValue({
      prompts: [prompt({ status: 'archived' })],
      nextCursor: null,
    });
    renderPage();
    await screen.findByText(TEXT);

    await user.click(screen.getByRole('button', { name: 'Yeniden etkinleştir' }));
    await waitFor(() =>
      expect(http.updateBusinessPrompt).toHaveBeenCalledWith('p1', { status: 'active' }),
    );
  });

  it('düzenlemede mevcut metni taşır ve kaydeder', async () => {
    const user = userEvent.setup();
    const NEW_TEXT = 'Pazartesi sabahı toplantısı';
    http.listBusinessPrompts.mockResolvedValue({
      prompts: [prompt({})],
      nextCursor: null,
    });
    renderPage();
    await screen.findByText(TEXT);

    await user.click(screen.getByRole('button', { name: 'Düzenle' }));
    const edit = screen.getByLabelText('Durumu düzenle') as HTMLTextAreaElement;
    expect(edit.value).toBe(TEXT);
    await user.clear(edit);
    await user.type(edit, NEW_TEXT);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(http.updateBusinessPrompt).toHaveBeenCalledWith('p1', { text: NEW_TEXT }),
    );
  });

  it('arama gönderiminde q parametresini taşır', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText('Ara'), 'kahve');
    await user.click(screen.getByRole('button', { name: 'Ara' }));

    await waitFor(() =>
      expect(http.listBusinessPrompts).toHaveBeenCalledWith({
        q: 'kahve',
        status: 'active',
        limit: 50,
      }),
    );
  });

  it('durum filtresi arşive alınınca listeden ister', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Henüz durum yok; yukarıdan ekle.');

    await user.click(screen.getByRole('radio', { name: 'Arşiv' }));
    await waitFor(() =>
      expect(http.listBusinessPrompts).toHaveBeenCalledWith({
        q: '',
        status: 'archived',
        limit: 50,
      }),
    );
  });
});
