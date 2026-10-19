import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BusinessHistoryPage from './BusinessHistoryPage';
import type { SessionSummary } from '@mol/shared';

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
  listBusinessSessions: vi.fn().mockResolvedValue({ sessions: [], nextCursor: null }),
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

const NOW = Date.now();

function session(over: Partial<SessionSummary>): SessionSummary {
  return {
    id: 's1',
    roomCode: 'ABC234',
    status: 'finished',
    mode: 'league',
    createdAt: NOW,
    startedAt: NOW + 60_000,
    endedAt: NOW + 240_000,
    endReason: 'completed',
    playerCount: 3,
    spectatorCount: 2,
    champion: 'Duman',
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/isletme/gecmis']}>
      <Routes>
        <Route path="/isletme/gecmis" element={<BusinessHistoryPage />} />
        <Route path="/isletme/gecmis/:id" element={<p>detay-sayfasi</p>} />
        <Route path="/isletme/giris" element={<p>giris-sayfasi</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  http.getBusinessMe.mockResolvedValue({
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
  });
  http.listBusinessSessions.mockResolvedValue({ sessions: [], nextCursor: null });
});

describe('BusinessHistoryPage', () => {
  it('boş geçmişte boş durum notunu gösterir', async () => {
    renderPage();
    expect(await screen.findByText('Henüz bitmiş oyun yok.')).toBeVisible();
    expect(http.listBusinessSessions).toHaveBeenCalledWith('past', { limit: 20 });
  });

  it('biten oturumu oda kodu, tarih, mod, durum ve şampiyonla listeler', async () => {
    http.listBusinessSessions.mockResolvedValue({
      sessions: [
        session({}),
        session({
          id: 's2',
          roomCode: 'XYZ789',
          status: 'cancelled',
          mode: 'elimination',
          champion: null,
        }),
      ],
      nextCursor: null,
    });
    renderPage();

    const link = await screen.findByRole('link', { name: /Oda ABC234/ });
    expect(link).toHaveAttribute('href', '/isletme/gecmis/s1');
    expect(link).toHaveTextContent('Bitti');
    expect(link).toHaveTextContent('Şampiyon: Duman');
    expect(screen.getByRole('link', { name: /Oda XYZ789/ })).toHaveTextContent('İptal edildi');
    expect(screen.getByRole('link', { name: /Oda XYZ789/ })).toHaveTextContent('Eleme');
  });

  it("satır detay sayfasına gider ('Daha fazla' olmadan buton gizli)", async () => {
    const user = userEvent.setup();
    http.listBusinessSessions.mockResolvedValue({ sessions: [session({})], nextCursor: null });
    renderPage();

    await user.click(await screen.findByRole('link', { name: /Oda ABC234/ }));
    expect(await screen.findByText('detay-sayfasi')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Daha fazla' })).toBeNull();
  });

  it('imleçle daha fazla yükler ve liste bitince butonu kaldırır', async () => {
    const user = userEvent.setup();
    const page1 = { sessions: [session({ id: 's1' })], nextCursor: 'cursor-1' };
    http.listBusinessSessions
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce({
        sessions: [session({ id: 's2', roomCode: 'XYZ789' })],
        nextCursor: null,
      });
    renderPage();
    await screen.findByRole('link', { name: /Oda ABC234/ });

    await user.click(screen.getByRole('button', { name: 'Daha fazla' }));

    expect(http.listBusinessSessions).toHaveBeenLastCalledWith('past', {
      cursor: 'cursor-1',
      limit: 20,
    });
    expect(await screen.findByRole('link', { name: /Oda XYZ789/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Daha fazla' })).toBeNull();
  });

  it('daha fazla yüklenemezse uyarı gösterir ve butonu bırakır', async () => {
    const user = userEvent.setup();
    const { HttpError } = (await import('@/net/http')) as unknown as {
      HttpError: new (status: number, code: string) => Error;
    };
    http.listBusinessSessions
      .mockResolvedValueOnce({ sessions: [session({})], nextCursor: 'cursor-1' })
      .mockRejectedValueOnce(new HttpError(500, 'HTTP_500'));
    renderPage();
    await screen.findByRole('link', { name: /Oda ABC234/ });

    await user.click(screen.getByRole('button', { name: 'Daha fazla' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Daha fazlası yüklenemedi; tekrar dene.',
    );
    expect(screen.getByRole('button', { name: 'Daha fazla' })).toBeEnabled();
  });

  it('liste alınamazsa yenile notu gösterir', async () => {
    const { HttpError } = (await import('@/net/http')) as unknown as {
      HttpError: new (status: number, code: string) => Error;
    };
    http.listBusinessSessions.mockRejectedValue(new HttpError(500, 'HTTP_500'));
    renderPage();

    expect(await screen.findByText('Geçmiş alınamadı; sayfayı yenile.')).toBeVisible();
  });

  it('oturum düşünce girişe yönlendirir', async () => {
    const { HttpError } = (await import('@/net/http')) as unknown as {
      HttpError: new (status: number, code: string) => Error;
    };
    http.getBusinessMe.mockRejectedValue(new HttpError(401, 'UNAUTHENTICATED'));
    renderPage();

    expect(await screen.findByText('giris-sayfasi')).toBeVisible();
  });
});
