import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { fakeReviewView, fakeSpectatorSelectionView } from '@/lib/fake';
import { DisplayReviewScene } from './DisplayScenes';
import { SpectatorSelectionScreen } from './SpectatorSelectionScreen';

const NOW = 1_000_000;
const ME_VOTER = { id: 'v1', nickname: 'İzleyici', role: 'voter' as const, votingFromRound: 1 };
const ROOM = { code: 'KA7FT2', joinUrl: 'https://mol.gg/o/KA7FT2' };

describe('SpectatorSelectionScreen', () => {
  it('eşleşme yoksa (lig modu) boş "Eşleşmeler" başlığı gösterilmez', () => {
    const view = { ...fakeSpectatorSelectionView(NOW), matches: [] };
    render(
      <SpectatorSelectionScreen
        view={view}
        me={ME_VOTER}
        now={NOW}
        onBrowseLibrary={() => undefined}
      />,
    );
    expect(screen.queryByText('Eşleşmeler')).not.toBeInTheDocument();
  });

  it('eşleşme varsa başlık ve düello kartları görünür', () => {
    render(
      <SpectatorSelectionScreen
        view={fakeSpectatorSelectionView(NOW)}
        me={ME_VOTER}
        now={NOW}
        onBrowseLibrary={() => undefined}
      />,
    );
    expect(screen.getByText('Eşleşmeler')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Eşleşmeler')).getAllByText('–')).toHaveLength(3);
  });
});

describe('DisplayReviewScene', () => {
  it('gönderi çerçeveleri (yer tutucu) ve gönderi sayısı görünür', () => {
    render(<DisplayReviewScene view={fakeReviewView(NOW)} now={NOW} room={ROOM} />);
    const list = screen.getByLabelText('Gönderiler');
    expect(within(list).getAllByRole('listitem')).toHaveLength(7);
    expect(screen.getByText(/7\/7 gönderi onaylandı/)).toBeInTheDocument();
  });
});
