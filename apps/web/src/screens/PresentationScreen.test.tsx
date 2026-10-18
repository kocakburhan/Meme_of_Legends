import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { fakeMe, fakePresentationView } from '@/lib/fake';
import { PresentationScreen } from './PresentationScreen';

const NOW = 1_000_000;

describe('PresentationScreen', () => {
  it('puan düğmesine tek dokunuş onRate çağırır', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    const view = fakePresentationView(NOW, 'image');
    render(<PresentationScreen view={view} me={fakeMe('player')} now={NOW} onRate={onRate} onToggleMute={() => undefined} />);

    await user.click(screen.getByRole('radio', { name: '4' }));

    expect(onRate).toHaveBeenCalledWith('s4', 4);
  });

  it('kendi gönderi kilitliyken puanlama pasiftir', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    const view = fakePresentationView(NOW, 'locked-own');
    render(
      <PresentationScreen
        view={view}
        me={fakeMe('player')}
        now={NOW}
        onRate={onRate}
        onToggleMute={() => undefined}
        ownSubmissionId="s4"
      />,
    );

    expect(screen.getByText('Kendi gönderini puanlayamazsın.')).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    for (const radio of radios) expect(radio).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: '5' }));
    expect(onRate).not.toHaveBeenCalled();
  });

  it('rakibin gönderisi kilitli görünür ve bildirim verir', () => {
    const view = fakePresentationView(NOW, 'locked-rival');
    render(
      <PresentationScreen
        view={view}
        me={fakeMe('player')}
        now={NOW}
        onRate={() => undefined}
        onToggleMute={() => undefined}
        rivalSubmissionId="s4"
      />,
    );
    expect(screen.getByText('Düello rakibinin gönderisi kilitli.')).toBeInTheDocument();
  });

  it('son karar saniyelerinde vurgu gösterir', () => {
    const view = fakePresentationView(NOW, 'last-call');
    render(<PresentationScreen view={view} me={fakeMe('player')} now={NOW} onRate={() => undefined} onToggleMute={() => undefined} />);
    expect(screen.getByText('Son karar!')).toBeInTheDocument();
  });

  it('video gönderide ses düğmesi görünür ve ses durumunu değiştirir', async () => {
    const user = userEvent.setup();
    const onToggleMute = vi.fn();
    const view = fakePresentationView(NOW, 'video');
    render(<PresentationScreen view={view} me={fakeMe('player')} now={NOW} onRate={() => undefined} onToggleMute={onToggleMute} muted />);

    await user.click(screen.getByRole('button', { name: /Sesi aç/ }));
    expect(onToggleMute).toHaveBeenCalledOnce();
  });

  it('gizlenmiş gönderi için açıklama gösterir', () => {
    const view = fakePresentationView(NOW, 'hidden');
    render(<PresentationScreen view={view} me={fakeMe('player')} now={NOW} onRate={() => undefined} onToggleMute={() => undefined} />);
    expect(screen.getByText('Bu gönderi gizlendi.')).toBeInTheDocument();
  });
});
