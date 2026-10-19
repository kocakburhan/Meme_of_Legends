import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BusinessHomePage from './BusinessHomePage';
import { passwordHintDismissed } from '@/panel/passwordHint';

const http = vi.hoisted(() => ({
  getBusinessMe: vi.fn().mockResolvedValue({
    business: { id: 'b1', name: 'Anka Kafe', username: 'anka', credits: 5, unlimitedCredits: false, concurrentSessionLimit: 1, lobbyLifetimeHours: 24, active: true },
  }),
  listBusinessSessions: vi.fn().mockResolvedValue({ sessions: [], nextCursor: null }),
  createBusinessSession: vi.fn(),
}));

vi.mock('@/net/http', () => ({
  HttpError: class HttpError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
    ) {
      super(`${status} ${code}`);
    }
  },
  ...http,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/isletme']}>
      <BusinessHomePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  http.getBusinessMe.mockResolvedValue({
    business: { id: 'b1', name: 'Anka Kafe', username: 'anka', credits: 5, unlimitedCredits: false, concurrentSessionLimit: 1, lobbyLifetimeHours: 24, active: true },
  });
  http.listBusinessSessions.mockResolvedValue({ sessions: [], nextCursor: null });
});

describe('BusinessHomePage', () => {
  it('sınırsız hakta "Sınırsız" yazar', async () => {
    http.getBusinessMe.mockResolvedValue({
      business: { id: 'b1', name: 'Anka Kafe', username: 'anka', credits: 0, unlimitedCredits: true, concurrentSessionLimit: 1, lobbyLifetimeHours: 24, active: true },
    });
    renderPage();
    expect(await screen.findByText('Sınırsız')).toBeVisible();
    expect(screen.getByText('Anka Kafe')).toBeVisible();
  });

  it('hak bittiğinde anlaşılır mesaj verir', async () => {
    const user = userEvent.setup();
    const { HttpError } = (await import('@/net/http')) as unknown as {
      HttpError: new (status: number, code: string) => Error & { status: number; code: string };
    };
    http.createBusinessSession.mockRejectedValue(new HttpError(409, 'INSUFFICIENT_CREDITS'));
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Yeni oyun' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Oyun hakkın kalmadı; lobi açmak için admin’den hak isteyebilirsin.');
  });

  it('şifre önerisi bandı kapatılınca bir daha görünmez', async () => {
    const user = userEvent.setup();
    const view = renderPage();
    await screen.findByText('Güvenlik için şifreni değiştirmen önerilir.');

    await user.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByText('Güvenlik için şifreni değiştirmen önerilir.')).toBeNull();
    expect(passwordHintDismissed()).toBe(true);

    view.unmount();
    renderPage();
    await screen.findByText('Oyun hakkı');
    expect(screen.queryByText('Güvenlik için şifreni değiştirmen önerilir.')).toBeNull();
  });
});
