import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Submission } from '@mol/engine';

import { fakeCategories, fakeLibrary, fakeMe, fakeSelectionPlayerView } from '@/lib/fake';
import { SelectionScreen } from './SelectionScreen';

const NOW = 1_000_000;

function renderScreen(
  options: {
    customContent?: boolean;
    ownSubmission?: Submission | null;
    onSelect?: (media: unknown) => void;
    onConfirm?: () => void;
  } = {},
) {
  const view = fakeSelectionPlayerView(NOW, options.ownSubmission ?? null);
  if (options.customContent === false) view.config = { ...view.config, customContent: false };
  return render(
    <SelectionScreen
      view={view}
      me={fakeMe('player')}
      now={NOW}
      library={fakeLibrary()}
      categories={fakeCategories()}
      onSelect={options.onSelect ?? (() => undefined)}
      onConfirm={options.onConfirm ?? (() => undefined)}
      onUploadCustom={async () => ({
        uploadId: 'u1',
        mediaType: 'image',
        previewUrl: '/p',
      })}
      onVerifyYoutube={async () => ({ videoId: 'dQw4w9WgXcQ', durationMs: null })}
    />,
  );
}

describe('SelectionScreen özel içerik sekmeleri', () => {
  it('özel içerik kapalıysa Yükle ve YouTube pasiftir ve nedeni yazılıdır', () => {
    renderScreen({ customContent: false });

    expect(screen.getByRole('tab', { name: 'Yükle' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'YouTube' })).toBeDisabled();
    expect(screen.getByText(/özel içerik kapalı/)).toBeInTheDocument();
  });

  it('Yükle sekmesi dosya seçiciyi açar', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('tab', { name: 'Yükle' }));

    expect(screen.getByLabelText('Dosya seç')).toBeInTheDocument();
    expect(screen.getByText(/JPG, PNG, WebP veya GIF/)).toBeInTheDocument();
  });

  it('YouTube sekmesi link alanını açar', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('tab', { name: 'YouTube' }));

    expect(screen.getByLabelText('YouTube linki')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Linki doğrula' })).toBeInTheDocument();
  });

  it('kütüphane seçimi mevcut akışı korur', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderScreen({ onSelect });

    await user.click(screen.getByRole('button', { name: /Maaş yattı ama kira da yattı/ }));

    expect(onSelect).toHaveBeenCalledWith({
      source: 'system',
      memeId: 'm1',
      mediaType: 'image',
    });
  });

  it('seçim varsa onay düğmesi çalışır', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const own: Submission = {
      id: 's1',
      playerId: 'p1',
      media: { source: 'upload', uploadId: 'u1', mediaType: 'image' },
      confirmed: false,
      invalid: false,
      hidden: false,
      compensation: false,
      customType: 'image',
    };
    renderScreen({ ownSubmission: own, onConfirm });

    await user.click(screen.getByRole('button', { name: 'Seçimimi onayla' }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
