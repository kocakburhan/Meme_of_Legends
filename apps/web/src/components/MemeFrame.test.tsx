import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
