import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CropEditor } from './CropEditor';

const startInput = () => screen.getByLabelText('Başlangıç') as HTMLInputElement;
const endInput = () => screen.getByLabelText('Bitiş') as HTMLInputElement;

describe('CropEditor', () => {
  it('varsayılan olarak ilk 25 saniyeyi seçer ve aralığı önizler', async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    render(<CropEditor durationMs={90_000} onPreview={onPreview} onSelect={() => undefined} />);

    expect(startInput().value).toBe('0');
    expect(endInput().value).toBe('25000');
    expect(screen.getByText('25,0 sn')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Aralığı oynat' }));
    expect(onPreview).toHaveBeenCalledWith(0, 25_000);
  });

  it('bitişi ok tuşuyla ileri alınca 25 sn sınırında başlangıç birlikte kayar', async () => {
    const user = userEvent.setup();
    render(
      <CropEditor durationMs={90_000} onPreview={() => undefined} onSelect={() => undefined} />,
    );

    endInput().focus();
    await user.keyboard('{ArrowRight}');

    expect(endInput().value).toBe('25250');
    expect(startInput().value).toBe('250');
    expect(screen.getByText('25,0 sn')).toBeInTheDocument();
  });

  it('başlangıcı geri alınca 25 sn sınırında bitiş birlikte kayar', async () => {
    const user = userEvent.setup();
    render(
      <CropEditor durationMs={90_000} onPreview={() => undefined} onSelect={() => undefined} />,
    );

    fireEvent.change(endInput(), { target: { value: '60000' } });
    expect(startInput().value).toBe('35000');
    expect(endInput().value).toBe('60000');

    fireEvent.change(startInput(), { target: { value: '10000' } });
    expect(startInput().value).toBe('10000');
    expect(endInput().value).toBe('35000');

    startInput().focus();
    await user.keyboard('{ArrowLeft}');
    expect(startInput().value).toBe('9750');
    expect(endInput().value).toBe('34750');
  });

  it('en az 1 saniyelik aralık bırakır', () => {
    render(
      <CropEditor durationMs={60_000} onPreview={() => undefined} onSelect={() => undefined} />,
    );
    fireEvent.change(startInput(), { target: { value: '30000' } });
    // Bitiş 25 sn'de: başlangıç en fazla 24 sn olabilir.
    expect(startInput().value).toBe('24000');
    expect(endInput().value).toBe('25000');
  });

  it('seçimi kaynak akışına devreder', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CropEditor durationMs={60_000} onPreview={() => undefined} onSelect={onSelect} />);

    fireEvent.change(startInput(), { target: { value: '5000' } });
    fireEvent.change(endInput(), { target: { value: '20000' } });
    await user.click(screen.getByRole('button', { name: 'Bu aralığı seç' }));

    expect(onSelect).toHaveBeenCalledWith({ startMs: 5_000, endMs: 20_000 });
    expect(screen.getByRole('status')).toHaveTextContent('Seçim gönderildi');
  });

  it('1 sn altındaki videoyu seçilemez gösterir', () => {
    render(<CropEditor durationMs={500} onPreview={() => undefined} onSelect={() => undefined} />);
    expect(screen.getByText(/en az 1 sn olmalı/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Başlangıç')).toBeNull();
  });
});
