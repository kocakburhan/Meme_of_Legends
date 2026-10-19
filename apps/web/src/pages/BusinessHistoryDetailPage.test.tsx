import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BusinessHistoryDetailPage from './BusinessHistoryDetailPage';
import type { SessionReport, SessionSummary } from '@mol/shared';
import { formatDateTime } from '@/lib/format';

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
  getBusinessSession: vi.fn(),
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

const CREATED_AT = Date.UTC(2026, 1, 12, 14, 3, 0);

const SESSION: SessionSummary = {
  id: 's1',
  roomCode: 'ABC234',
  status: 'finished',
  mode: 'league',
  createdAt: CREATED_AT,
  startedAt: CREATED_AT + 60_000,
  endedAt: CREATED_AT + 180_000,
  endReason: 'completed',
  playerCount: 3,
  spectatorCount: 2,
  champion: 'Duman',
};

const REPORT: SessionReport = {
  rounds: 3,
  standings: [
    { rank: 1, nickname: 'Duman', score: 13.5 },
    { rank: 2, nickname: 'Kral', score: 9 },
  ],
  juryAwards: [
    { title: 'En sert jüri', nickname: 'Kral' },
    { title: 'En cömert jüri', nickname: 'İzleyici' },
  ],
  hiddenContentCount: 2,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/isletme/gecmis/s1']}>
      <Routes>
        <Route path="/isletme/gecmis/:id" element={<BusinessHistoryDetailPage />} />
        <Route path="/isletme/gecmis" element={<p>liste-sayfasi</p>} />
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
  http.getBusinessSession.mockResolvedValue({ session: SESSION, report: REPORT });
});

describe('BusinessHistoryDetailPage', () => {
  it('özet alanlarını raporla birlikte gösterir', async () => {
    renderPage();

    const summary = await screen.findByLabelText('Oyun özeti');
    expect(within(summary).getByText('Oda ABC234')).toBeVisible();
    expect(within(summary).getByText('Lig')).toBeVisible();
    expect(within(summary).getByText('Bitti')).toBeVisible();
    expect(within(summary).getByText(formatDateTime(SESSION.createdAt))).toBeVisible();
    // 120 s → "2 dk".
    expect(within(summary).getByText('2 dk')).toBeVisible();
    expect(within(summary).getByText('3 oyuncu · 2 seyirci')).toBeVisible();
    expect(within(summary).getByText('Şampiyon')).toBeVisible();
    expect(within(summary).getByText('Duman')).toBeVisible();
    expect(within(summary).getByText('Oyun tamamlandı')).toBeVisible();

    // Sıralama: puan Türkçe biçimde (SPEC 8.2).
    const standings = screen.getByLabelText('Sıralama');
    expect(within(standings).getAllByText('Duman')).toHaveLength(1);
    expect(within(standings).getByText('Kral')).toBeVisible();
    expect(within(standings).getByText('13,50')).toBeVisible();
    expect(within(standings).getByText('9,00')).toBeVisible();

    // Jüri ödülleri ve gizlenen içerik.
    const jury = screen.getByLabelText('Jüri ödülleri');
    expect(within(jury).getByText('En sert jüri')).toBeVisible();
    expect(within(jury).getByText('En cömert jüri')).toBeVisible();
    expect(within(jury).getByText('İzleyici')).toBeVisible();
    expect(within(screen.getByLabelText('İçerik durumu')).getByText('2')).toBeVisible();
  });

  it('oyun oynanmadan kapanan oturumda boş değerler ve rapor yok notu gösterir', async () => {
    http.getBusinessSession.mockResolvedValue({
      session: {
        ...SESSION,
        status: 'cancelled',
        startedAt: null,
        endedAt: null,
        endReason: 'managerCancelled',
        playerCount: null,
        spectatorCount: null,
        champion: null,
      },
      report: null,
    });
    renderPage();

    const summary = await screen.findByLabelText('Oyun özeti');
    expect(within(summary).getByText('İptal edildi')).toBeVisible();
    expect(within(summary).getAllByText('—')).toHaveLength(3); // süre, katılımcılar, şampiyon
    expect(within(summary).getByText('Lobi iptal edildi')).toBeVisible();
    expect(screen.getByText('Bu oturum oyun oynanmadan kapandı; rapor yok.')).toBeVisible();
    expect(screen.queryByLabelText('Sıralama')).toBeNull();
    expect(screen.queryByLabelText('Jüri ödülleri')).toBeNull();
  });

  it('jüri ödülü yoksa açık not verir', async () => {
    http.getBusinessSession.mockResolvedValue({
      session: SESSION,
      report: { ...REPORT, juryAwards: [] },
    });
    renderPage();

    expect(await screen.findByText('Bu oyunda jüri ödülü verilmedi.')).toBeVisible();
  });

  it('olmayan oturumda bulunamadı notu gösterir', async () => {
    const { HttpError } = (await import('@/net/http')) as unknown as {
      HttpError: new (status: number, code: string) => Error;
    };
    http.getBusinessSession.mockRejectedValue(new HttpError(404, 'NOT_FOUND'));
    renderPage();

    expect(await screen.findByText('Bu oyun bulunamadı; listeden tekrar seç.')).toBeVisible();
  });

  it('diğer hatalarda yenile notu gösterir', async () => {
    const { HttpError } = (await import('@/net/http')) as unknown as {
      HttpError: new (status: number, code: string) => Error;
    };
    http.getBusinessSession.mockRejectedValue(new HttpError(500, 'HTTP_500'));
    renderPage();

    expect(await screen.findByText('Oyun bilgisi alınamadı; sayfayı yenile.')).toBeVisible();
  });

  it('oturum düşünce girişe yönlendirir', async () => {
    const { HttpError } = (await import('@/net/http')) as unknown as {
      HttpError: new (status: number, code: string) => Error;
    };
    http.getBusinessMe.mockRejectedValue(new HttpError(401, 'UNAUTHENTICATED'));
    renderPage();

    expect(await screen.findByText('giris-sayfasi')).toBeVisible();
  });

  it('Geçmişe dön bağlantısı listeye döner', async () => {
    renderPage();

    await screen.findByText('Oda ABC234');
    expect(screen.getByRole('link', { name: '← Geçmişe dön' })).toHaveAttribute(
      'href',
      '/isletme/gecmis',
    );
  });
});
