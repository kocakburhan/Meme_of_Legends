import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomMediaProvider } from './CustomMedia';
import { MemeFrame } from './MemeFrame';

/**
 * SPEC 12.3 (madde 6): yüklenemeyen medya kırık resim simgesi göstermez;
 * bir kez yeniden denenir, olmazsa sade "Bu cihazda yüklenemedi" yer tutucusu.
 */

const image = { source: 'system', memeId: 'm1', mediaType: 'image' } as const;
const video = { source: 'system', memeId: 'm1', mediaType: 'video' } as const;

describe('MemeFrame', () => {
  it('src yoksa nötr yer tutucu çizimi gösterir', () => {
    render(<MemeFrame media={image} title="Boş" />);
    expect(screen.queryByRole('img')).toBeNull();
    // Başlık hem yer tutucuda hem sr-only figcaptionda görünür.
    expect(screen.getAllByText('Boş')).toHaveLength(2);
  });

  it('hata sonrası bir kez yeniden dener, sonra "Bu cihazda yüklenemedi" gösterir', () => {
    const { container } = render(
      <MemeFrame media={image} src="/media/memes/m1/media.png" title="Deneme" />,
    );
    const first = screen.getByRole('img', { name: 'Deneme' });
    fireEvent.error(first);
    // İlk hatada yeniden mount edilir (yeniden deneme).
    const retried = screen.getByRole('img', { name: 'Deneme' });
    expect(retried).not.toBe(first);
    expect(screen.queryByText('Bu cihazda yüklenemedi')).toBeNull();
    fireEvent.error(retried);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByText('Bu cihazda yüklenemedi')).toBeVisible();
  });

  it('video için de aynı davranır', () => {
    const { container } = render(<MemeFrame media={video} src="/media/memes/m1/media.mp4" />);
    const first = container.querySelector('video');
    expect(first).not.toBeNull();
    fireEvent.error(first!);
    expect(container.querySelector('video')).not.toBeNull();
    fireEvent.error(container.querySelector('video')!);
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByText('Bu cihazda yüklenemedi')).toBeVisible();
  });

  it('medya adresi değişince hata durumu sıfırlanır', () => {
    const { rerender } = render(
      <MemeFrame media={image} src="/media/memes/m1/media.png" title="Deneme" />,
    );
    fireEvent.error(screen.getByRole('img', { name: 'Deneme' }));
    fireEvent.error(screen.getByRole('img', { name: 'Deneme' }));
    expect(screen.getByText('Bu cihazda yüklenemedi')).toBeVisible();
    rerender(<MemeFrame media={image} src="/media/memes/m2/media.png" title="Yeni" />);
    expect(screen.queryByText('Bu cihazda yüklenemedi')).toBeNull();
    expect(screen.getByRole('img', { name: 'Yeni' })).toBeVisible();
  });
});

/* ------------------------ Özel içerik (M6b-2, madde 3-4) ------------------------ */

const upload = { source: 'upload', uploadId: 'u1', mediaType: 'image' } as const;
const youtube = {
  source: 'youtube',
  videoId: 'dQw4w9WgXcQ',
  startMs: 1_000,
  endMs: 20_000,
} as const;

class FakePlayer {
  constructor(
    _element: HTMLElement,
    options: { events?: { onReady?: (event: { target: FakePlayer }) => void } },
  ) {
    options.events?.onReady?.({ target: this });
  }
  getCurrentTime(): number {
    return 0;
  }
  seekTo(): void {}
  playVideo(): void {}
  pauseVideo(): void {}
  mute(): void {}
  unMute(): void {}
  destroy(): void {}
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
  window.YT = undefined;
});

describe('MemeFrame özel içerik', () => {
  it('upload medyasını aynı köken adresten çözer (çerezli yüzey)', () => {
    render(
      <CustomMediaProvider settings={{ code: 'ABCDEF' }}>
        <MemeFrame media={upload} submissionId="s1" title="Yüklenen" />
      </CustomMediaProvider>,
    );
    expect(screen.getByRole('img', { name: 'Yüklenen' })).toHaveAttribute(
      'src',
      '/api/rooms/ABCDEF/custom/uploads/u1',
    );
  });

  it('ortak ekranda dosyayı Bearer ile alıp blob URL gösterir', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:test'),
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });

    render(
      <CustomMediaProvider settings={{ code: 'ABCDEF', token: 'display-token' }}>
        <MemeFrame media={upload} submissionId="s1" title="Yüklenen" />
      </CustomMediaProvider>,
    );

    expect(await screen.findByRole('img', { name: 'Yüklenen' })).toHaveAttribute(
      'src',
      'blob:test',
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/rooms/ABCDEF/custom/uploads/u1', {
      headers: { authorization: 'Bearer display-token' },
    });
  });

  it('iki denemede yüklenemeyen özel içeriği bir kez bildirir', () => {
    const onMediaError = vi.fn();
    render(
      <CustomMediaProvider settings={{ code: 'ABCDEF', onMediaError }}>
        <MemeFrame media={upload} submissionId="s1" title="Yüklenen" />
      </CustomMediaProvider>,
    );

    fireEvent.error(screen.getByRole('img', { name: 'Yüklenen' }));
    fireEvent.error(screen.getByRole('img', { name: 'Yüklenen' }));

    expect(screen.getByText('Bu cihazda yüklenemedi')).toBeVisible();
    expect(onMediaError).toHaveBeenCalledTimes(1);
    expect(onMediaError).toHaveBeenCalledWith('s1');

    // "Yeniden dene" yeni bir deneme açar; başarılı yüklemede bildirim yinelenmez.
    fireEvent.click(screen.getByRole('button', { name: 'Yeniden dene' }));
    fireEvent.error(screen.getByRole('img', { name: 'Yüklenen' }));
    fireEvent.error(screen.getByRole('img', { name: 'Yüklenen' }));
    expect(onMediaError).toHaveBeenCalledTimes(1);
  });

  it('youtube medyasını gizlilik modlu klibe çözer', () => {
    window.YT = { Player: FakePlayer } as unknown as Window['YT'];

    render(
      <CustomMediaProvider settings={{ code: 'ABCDEF', muted: true }}>
        <MemeFrame media={youtube} submissionId="s2" title="Klip" />
      </CustomMediaProvider>,
    );

    expect(document.querySelector('[data-youtube-clip="dQw4w9WgXcQ"]')).not.toBeNull();
  });
});
