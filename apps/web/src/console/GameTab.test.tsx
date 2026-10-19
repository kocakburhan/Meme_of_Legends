import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { View } from '@mol/engine';

import { CustomMediaProvider } from '@/components/CustomMedia';
import { fakeSelectionPlayerView } from '@/lib/fake';
import { GameTab } from './GameTab';

/**
 * Konsol canlı listesi (SPEC 7.1, 14.2): gönderen adı + küçük önizleme,
 * onaylı Reddet; ayar kapalıysa neden yazılıdır (madde 5).
 */

const NOW = 1_000_000;

function customSelectionView(): View {
  const view = fakeSelectionPlayerView(NOW);
  view.submissions = [
    {
      id: 's1',
      media: { source: 'upload', uploadId: 'u1', mediaType: 'image' },
      hidden: false,
      playerId: 'p2',
    },
  ];
  return view;
}

function renderTab(view: View) {
  const send = vi.fn(async () => ({ ok: true }));
  render(
    <CustomMediaProvider settings={{ code: 'KA7FT2' }}>
      <GameTab
        view={view}
        code="KA7FT2"
        now={NOW}
        account={null}
        send={send}
        sendShell={async () => ({ ok: true })}
        onAckNote={() => undefined}
      />
    </CustomMediaProvider>,
  );
  return send;
}

describe('GameTab özel içerik canlı listesi', () => {
  it('gönderen adıyla ve küçük önizlemeyle listeler', () => {
    renderTab(customSelectionView());

    expect(screen.getByText('Ali')).toBeInTheDocument();
    expect(document.querySelector('img[src="/api/rooms/KA7FT2/custom/uploads/u1"]')).not.toBeNull();
  });

  it('Reddet onay ister, sonra rejectCustom gönderir', async () => {
    const user = userEvent.setup();
    const send = renderTab(customSelectionView());

    await user.click(screen.getByRole('button', { name: 'Reddet' }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText(/tüm ekranlardan kaldırılır/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Evet, reddet' }));
    expect(send).toHaveBeenCalledWith({ type: 'rejectCustom', participantId: 'p2' });
  });

  it('ayar kapalıysa listeyi göstermez, nedeni yazar', () => {
    const view = customSelectionView();
    view.config = { ...view.config, customContent: false };
    renderTab(view);

    expect(screen.getByText(/özel içerik kapalı/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reddet' })).toBeNull();
  });
});
