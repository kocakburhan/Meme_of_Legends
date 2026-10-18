import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { JoinScreen } from './JoinScreen';

describe('JoinScreen', () => {
  it('çok kısa takma adda hata gösterir ve giriş yapmaz', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    render(<JoinScreen code="KA7FT2" businessName="Anka Kafe" onEnter={onEnter} />);

    await user.type(screen.getByLabelText('Takma adın'), 'A');
    await user.click(screen.getByRole('button', { name: 'Odaya gir' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Takma ad en az 2 karakter olmalı.');
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('geçerli takma adla seçilen rolle onEnter çağrılır', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    render(<JoinScreen code="KA7FT2" businessName="Anka Kafe" onEnter={onEnter} />);

    await user.type(screen.getByLabelText('Takma adın'), 'Ali');
    await user.click(screen.getByRole('radio', { name: /Seyirci/ }));
    await user.click(screen.getByRole('button', { name: 'Odaya gir' }));

    expect(onEnter).toHaveBeenCalledWith({ code: null, nickname: 'Ali', role: 'voter' });
  });

  it('oyun başladıysa oyuncu kartı pasiftir', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    render(<JoinScreen code="KA7FT2" allowPlayer={false} onEnter={onEnter} />);

    const playerRadio = screen.getByRole('radio', { name: /Oyuncu/ });
    expect(playerRadio).toBeDisabled();

    await user.type(screen.getByLabelText('Takma adın'), 'Zeynep');
    await user.click(screen.getByRole('button', { name: 'Odaya gir' }));
    expect(onEnter).toHaveBeenCalledWith({ code: null, nickname: 'Zeynep', role: 'voter' });
  });

  it('kod girişinde geçersiz kod hatası verir', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    render(<JoinScreen onEnter={onEnter} />);

    const code = screen.getByLabelText('Oda kodu');
    await user.type(code, 'OPIAOT'); // O ve I karışan karakterler
    await user.type(screen.getByLabelText('Takma adın'), 'Ali');
    await user.click(screen.getByRole('button', { name: 'Odaya gir' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Kodda 0, O, 1 ve I kullanılmaz');
    expect(onEnter).not.toHaveBeenCalled();
  });
});
