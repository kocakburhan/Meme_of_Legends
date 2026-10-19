import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CustomMediaProvider } from '@/components/CustomMedia';
import { fakeReviewView } from '@/lib/fake';
import { ReviewScreen } from './ReviewScreen';

const NOW = 1_000_000;

describe('ReviewScreen', () => {
  it('puanlanmamış gönderi vurgulanır ve küçük ölçekten puan verilebilir', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    const view = fakeReviewView(NOW);
    render(<ReviewScreen view={view} now={NOW} ownSubmissionId="s4" onRate={onRate} onFinish={() => undefined} />);

    expect(screen.getByText('Puan ver')).toBeInTheDocument(); // s2 puanlanmamış
    const group = screen.getByRole('radiogroup', { name: 'Gönderi s2 için puan' });
    await user.click(within(group).getByRole('radio', { name: '5' }));

    expect(onRate).toHaveBeenCalledWith('s2', 5);
  });

  it('kendi gönderim kilitli ve soluk görünür', () => {
    const view = fakeReviewView(NOW);
    render(<ReviewScreen view={view} now={NOW} ownSubmissionId="s4" onRate={() => undefined} onFinish={() => undefined} />);

    expect(screen.getByText('Kendi gönderin; puanlanamaz.')).toBeInTheDocument();
  });

  it('gizlenmiş gönderi puanlanamaz', () => {
    const view = fakeReviewView(NOW);
    render(<ReviewScreen view={view} now={NOW} onRate={() => undefined} onFinish={() => undefined} />);
    expect(screen.getByText('Gizlendi; puanlanamaz.')).toBeInTheDocument();
  });

  it('"Bitirdim" onFinish çağırır; bitirdikten sonra düğme pasifleşir', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    const view = fakeReviewView(NOW);
    const { rerender } = render(<ReviewScreen view={view} now={NOW} onRate={() => undefined} onFinish={onFinish} />);

    await user.click(screen.getByRole('button', { name: 'Bitirdim' }));
    expect(onFinish).toHaveBeenCalledOnce();

    rerender(<ReviewScreen view={view} now={NOW} onRate={() => undefined} onFinish={onFinish} finished />);
    expect(screen.getByRole('button', { name: 'Bitirdin, bekleniyor…' })).toBeDisabled();
  });

  it('özel yüklemeyi final gözden geçirmede de gösterir (madde 3)', () => {
    const view = fakeReviewView(NOW);
    view.submissions = [
      {
        id: 's9',
        media: { source: 'upload', uploadId: 'u1', mediaType: 'image' },
        hidden: false,
        canRate: true,
      },
    ];
    render(
      <CustomMediaProvider settings={{ code: 'ABCDEF' }}>
        <ReviewScreen view={view} now={NOW} onRate={() => undefined} onFinish={() => undefined} />
      </CustomMediaProvider>,
    );

    expect(document.querySelector('img[src="/api/rooms/ABCDEF/custom/uploads/u1"]')).not.toBeNull();
  });
});
