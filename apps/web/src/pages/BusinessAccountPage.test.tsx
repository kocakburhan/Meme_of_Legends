import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BusinessAccountPage from './BusinessAccountPage';
import { passwordHintDismissed } from '@/panel/passwordHint';

const http = vi.hoisted(() => ({
  changeBusinessPassword: vi.fn(),
  logoutBusiness: vi.fn(),
  getBusinessMe: vi.fn().mockResolvedValue({
    business: { id: 'b1', name: 'Anka Kafe', username: 'anka', credits: 5, unlimitedCredits: false, concurrentSessionLimit: 1, lobbyLifetimeHours: 24, active: true },
  }),
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
    <MemoryRouter initialEntries={['/isletme/hesap']}>
      <BusinessAccountPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('BusinessAccountPage', () => {
  it('kısa yeni şifrede hata verir ve ağ çağrısı yapmaz', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Mevcut şifre'), 'eski-sifre-123');
    await user.type(screen.getByLabelText('Yeni şifre'), 'kısa');
    await user.type(screen.getByLabelText('Yeni şifre (tekrar)'), 'kısa');
    await user.click(screen.getByRole('button', { name: 'Şifreyi değiştir' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Yeni şifre en az 12, en fazla 128 karakter olmalı.');
    expect(http.changeBusinessPassword).not.toHaveBeenCalled();
  });

  it('uyuşmayan tekrarda hata verir', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Mevcut şifre'), 'eski-sifre-123');
    await user.type(screen.getByLabelText('Yeni şifre'), 'yeni-sifre-1234');
    await user.type(screen.getByLabelText('Yeni şifre (tekrar)'), 'yeni-sifre-9876');
    await user.click(screen.getByRole('button', { name: 'Şifreyi değiştir' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Yeni şifreler birbiriyle uyuşmuyor.');
    expect(http.changeBusinessPassword).not.toHaveBeenCalled();
  });

  it('başarıda "diğer cihazlar" bilgisini gösterir ve öneri bandını kapatır', async () => {
    const user = userEvent.setup();
    http.changeBusinessPassword.mockResolvedValue({ ok: true });
    renderPage();
    await user.type(screen.getByLabelText('Mevcut şifre'), 'eski-sifre-123');
    await user.type(screen.getByLabelText('Yeni şifre'), 'yeni-sifre-1234');
    await user.type(screen.getByLabelText('Yeni şifre (tekrar)'), 'yeni-sifre-1234');
    await user.click(screen.getByRole('button', { name: 'Şifreyi değiştir' }));

    expect(await screen.findByText('Diğer cihazlardaki girişler kapatıldı; bu cihaz açık kaldı.')).toBeVisible();
    expect(http.changeBusinessPassword).toHaveBeenCalledWith({ currentPassword: 'eski-sifre-123', newPassword: 'yeni-sifre-1234' });
    expect(passwordHintDismissed()).toBe(true);
  });
});
