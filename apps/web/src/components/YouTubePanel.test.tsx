import { useEffect, useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpError } from '@/net/http';
import { YouTubePanel } from './YouTubePanel';
import type { YouTubePlayerProps } from './YouTubePlayer';

const previewCalls: Array<[number, number]> = [];

function FakePlayer({ onDuration, controlsRef }: YouTubePlayerProps) {
  const duration = useRef(onDuration);
  useEffect(() => {
    duration.current = onDuration;
  }, [onDuration]);
  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = {
      playRange: (startMs, endMs) => previewCalls.push([startMs, endMs]),
      stop: () => undefined,
    };
    duration.current(90_000);
    return () => {
      controlsRef.current = null;
    };
  }, [controlsRef]);
  return <div data-testid="fake-player">Sahte oynatıcı</div>;
}

function FailingPlayer({ onError }: YouTubePlayerProps) {
  const error = useRef(onError);
  useEffect(() => {
    error.current = onError;
  }, [onError]);
  useEffect(() => {
    error.current?.();
  }, []);
  return <div data-testid="failing-player" />;
}

const verified = { videoId: 'dQw4w9WgXcQ', durationMs: null };

beforeEach(() => {
  previewCalls.length = 0;
});

describe('YouTubePanel', () => {
  it('boş linkte doğrulama isteği göndermez', async () => {
    const user = userEvent.setup();
    const onVerify = vi.fn();
    render(<YouTubePanel onVerify={onVerify} onSelect={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Linki doğrula' }));

    expect(onVerify).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Bir YouTube linki yapıştır.');
  });

  it('gömülemeyen videoyu Türkçe hata ile bildirir', async () => {
    const user = userEvent.setup();
    const onVerify = vi.fn().mockRejectedValue(new HttpError(422, 'YOUTUBE_NOT_EMBEDDABLE'));
    render(<YouTubePanel onVerify={onVerify} onSelect={() => undefined} />);

    await user.type(screen.getByLabelText('YouTube linki'), 'https://youtu.be/dQw4w9WgXcQ');
    await user.click(screen.getByRole('button', { name: 'Linki doğrula' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bu video gömülemiyor; başka bir video seç.',
    );
    expect(onVerify).toHaveBeenCalledWith('https://youtu.be/dQw4w9WgXcQ');
    expect(screen.queryByLabelText('Başlangıç')).toBeNull();
  });

  it('özel/silinmiş videoyu Türkçe hata ile bildirir', async () => {
    const user = userEvent.setup();
    const onVerify = vi.fn().mockRejectedValue(new HttpError(422, 'YOUTUBE_NOT_PUBLIC'));
    render(<YouTubePanel onVerify={onVerify} onSelect={() => undefined} />);

    await user.type(screen.getByLabelText('YouTube linki'), 'https://youtu.be/dQw4w9WgXcQ');
    await user.click(screen.getByRole('button', { name: 'Linki doğrula' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Video özel, silinmiş veya bulunamadı',
    );
  });

  it('doğrulanan videoda süreyi oynatıcıdan alır, önizler ve seçimi devreder', async () => {
    const user = userEvent.setup();
    const onVerify = vi.fn().mockResolvedValue(verified);
    const onSelect = vi.fn();
    render(<YouTubePanel onVerify={onVerify} onSelect={onSelect} PlayerComponent={FakePlayer} />);

    await user.type(screen.getByLabelText('YouTube linki'), 'https://youtu.be/dQw4w9WgXcQ');
    await user.click(screen.getByRole('button', { name: 'Linki doğrula' }));

    const start = await screen.findByLabelText('Başlangıç');
    expect(screen.getByTestId('fake-player')).toBeInTheDocument();
    expect((start as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('Bitiş') as HTMLInputElement).value).toBe('25000');

    fireEvent.change(start, { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText('Bitiş'), { target: { value: '20000' } });

    await user.click(screen.getByRole('button', { name: 'Aralığı oynat' }));
    expect(previewCalls).toEqual([[5_000, 20_000]]);

    await user.click(screen.getByRole('button', { name: 'Bu aralığı seç' }));
    expect(onSelect).toHaveBeenCalledWith({
      source: 'youtube',
      videoId: 'dQw4w9WgXcQ',
      startMs: 5_000,
      endMs: 20_000,
    });
  });

  it('oynatıcı yüklenemezse yeniden deneme sunar', async () => {
    const user = userEvent.setup();
    const onVerify = vi.fn().mockResolvedValue(verified);
    render(
      <YouTubePanel
        onVerify={onVerify}
        onSelect={() => undefined}
        PlayerComponent={FailingPlayer}
      />,
    );

    await user.type(screen.getByLabelText('YouTube linki'), 'https://youtu.be/dQw4w9WgXcQ');
    await user.click(screen.getByRole('button', { name: 'Linki doğrula' }));

    expect(await screen.findByText(/Video bu cihazda yüklenemedi/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Oynatıcıyı yeniden dene' })).toBeInTheDocument();
  });
});
