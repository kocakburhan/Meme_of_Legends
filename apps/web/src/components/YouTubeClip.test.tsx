import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { YouTubeClip } from './YouTubeClip';

/**
 * Gönderi gösterimi klibi (SPEC 7.2): startMs'ten başlar, endMs'te durur,
 * bir kez oynar; otomatik oynatma engellenirse kısığa düşüp kullanıcıya
 * "Sesi aç" / "Videoyu oynat" sunar (SPEC 13.2).
 */

interface ReadyEvent {
  target: FakePlayer;
}

class FakePlayer {
  static instances: FakePlayer[] = [];
  /** Saniye cinsinden konum (gerçek IFrame API gibi). */
  time = 0;
  playing = false;
  muted = false;
  readonly seekTo = vi.fn((seconds: number) => {
    this.time = seconds;
  });
  readonly playVideo = vi.fn(() => {
    this.playing = true;
  });
  readonly pauseVideo = vi.fn(() => {
    this.playing = false;
  });
  readonly mute = vi.fn(() => {
    this.muted = true;
  });
  readonly unMute = vi.fn(() => {
    this.muted = false;
  });
  readonly destroy = vi.fn();
  private readonly options: {
    events?: { onReady?: (event: ReadyEvent) => void; onError?: () => void };
  };

  constructor(
    _element: HTMLElement,
    options: {
      events?: { onReady?: (event: ReadyEvent) => void; onError?: () => void };
    },
  ) {
    this.options = options;
    FakePlayer.instances.push(this);
  }

  getIframe(): HTMLIFrameElement {
    return document.createElement('iframe');
  }

  getCurrentTime(): number {
    return this.time;
  }

  ready(): void {
    this.options.events?.onReady?.({ target: this });
  }

  emitError(): void {
    this.options.events?.onError?.();
  }
}

function installFakeYouTube(): void {
  FakePlayer.instances = [];
  window.YT = { Player: FakePlayer } as unknown as Window['YT'];
}

beforeEach(() => {
  vi.useFakeTimers();
  installFakeYouTube();
});

afterEach(() => {
  vi.useRealTimers();
  window.YT = undefined;
});

async function renderClip(
  props: Partial<Parameters<typeof YouTubeClip>[0]> = {},
): Promise<FakePlayer> {
  render(
    <YouTubeClip
      videoId="dQw4w9WgXcQ"
      startMs={5_000}
      endMs={20_000}
      muted
      {...props}
    />,
  );
  await act(async () => undefined);
  const player = FakePlayer.instances[0]!;
  act(() => player.ready());
  return player;
}

describe('YouTubeClip', () => {
  it("kısık başlar, startMs'e konumlanır ve oynar", async () => {
    const player = await renderClip();

    expect(player.seekTo).toHaveBeenCalledWith(5, true);
    expect(player.playVideo).toHaveBeenCalled();
    expect(player.mute).toHaveBeenCalled();
    expect(document.querySelector('[data-youtube-clip="dQw4w9WgXcQ"]')).not.toBeNull();
  });

  it("endMs'e ulaşınca durur ve bir daha sarmaz", async () => {
    const player = await renderClip();
    player.time = 19.98;

    act(() => vi.advanceTimersByTime(100));

    expect(player.pauseVideo).toHaveBeenCalled();
    expect(player.seekTo).toHaveBeenLastCalledWith(20, true);

    const pauses = player.pauseVideo.mock.calls.length;
    act(() => vi.advanceTimersByTime(500));
    expect(player.pauseVideo.mock.calls.length).toBe(pauses);
  });

  it('otomatik oynatma ilerlemezse "Videoyu oynat" düğmesi sunar', async () => {
    const player = await renderClip();

    act(() => vi.advanceTimersByTime(2_200));

    expect(player.playVideo.mock.calls.length).toBeGreaterThan(1);
    const button = screen.getByRole('button', { name: /Videoyu oynat/ });
    fireEvent.click(button);
    expect(player.unMute).toHaveBeenCalled();
    expect(player.playVideo.mock.calls.length).toBeGreaterThan(2);
    expect(screen.queryByRole('button', { name: /Videoyu oynat/ })).toBeNull();
  });

  it('sesli başlatma engellenirse kısığa düşer ve "Sesi aç" sunar', async () => {
    const player = await renderClip({ muted: false });

    act(() => vi.advanceTimersByTime(2_200));

    expect(player.mute).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Sesi aç/ })).toBeInTheDocument();
  });

  it('oynatıcı hatasını yukarıya bildirir', async () => {
    const onError = vi.fn();
    const player = await renderClip({ onError });

    act(() => player.emitError());

    expect(onError).toHaveBeenCalledOnce();
  });
});
