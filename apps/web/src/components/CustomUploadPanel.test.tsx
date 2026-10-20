import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CustomUploadPanel } from './CustomUploadPanel';
import { HttpError } from '@/net/http';
import type { CustomUpload } from '@/net/custom';

function testFile(name: string, type: string, size = 1024): File {
  const file = new File(['içerik'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('CustomUploadPanel', () => {
  it('video dosyasını sunucuya göndermeden reddeder', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    render(<CustomUploadPanel onUpload={onUpload} onSelect={() => undefined} />);

    const input = screen.getByLabelText('Dosya seç');
    await user.upload(input, testFile('klip.mp4', 'video/mp4'));

    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Video yüklenemez; YouTube linki kullan.');
    // Hata alana bağlanır (SPEC 18).
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const errorId = input.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveAttribute('id', errorId);
  });

  it('10 MB üstündeki dosyayı sunucuya göndermeden reddeder', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    render(<CustomUploadPanel onUpload={onUpload} onSelect={() => undefined} />);

    await user.upload(
      screen.getByLabelText('Dosya seç'),
      testFile('buyuk.png', 'image/png', 10 * 1024 * 1024 + 1),
    );

    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent("Dosya 10 MB'den büyük olamaz.");
  });

  it('ilerlemeyi gösterir, previewUrl önizlemesini ve seçimi sunar', async () => {
    const user = userEvent.setup();
    let finish!: (value: CustomUpload) => void;
    const onUpload = vi.fn(
      (_file: File, onProgress: (percent: number) => void) =>
        new Promise<CustomUpload>((resolve) => {
          onProgress(42);
          finish = resolve;
        }),
    );
    const onSelect = vi.fn();
    render(<CustomUploadPanel onUpload={onUpload} onSelect={onSelect} />);

    await user.upload(screen.getByLabelText('Dosya seç'), testFile('a.png', 'image/png'));

    expect(screen.getByText('Yükleniyor… %42')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Yükleme ilerlemesi' })).toBeInTheDocument();

    await act(async () => {
      finish({
        uploadId: 'u1',
        mediaType: 'image',
        previewUrl: '/api/rooms/ABCDEF/custom/uploads/u1',
      });
    });

    expect(await screen.findByRole('img', { name: 'Yüklediğin içerik' })).toHaveAttribute(
      'src',
      '/api/rooms/ABCDEF/custom/uploads/u1',
    );

    await user.click(screen.getByRole('button', { name: 'Bu içeriği seç' }));
    expect(onSelect).toHaveBeenCalledWith({
      source: 'upload',
      uploadId: 'u1',
      mediaType: 'image',
    });
    expect(await screen.findByText(/Seçim gönderildi/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seçimi yeniden gönder' })).toBeInTheDocument();
  });

  it('image/jpg dosyasını image/jpeg olarak yükler', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn(
      async (_file: File, _onProgress: (percent: number) => void): Promise<CustomUpload> => ({
        uploadId: 'u2',
        mediaType: 'image',
        previewUrl: '/p',
      }),
    );
    render(<CustomUploadPanel onUpload={onUpload} onSelect={() => undefined} />);

    await user.upload(screen.getByLabelText('Dosya seç'), testFile('a.jpg', 'image/jpg'));

    const uploaded = onUpload.mock.calls[0]?.[0] as File;
    expect(uploaded.type).toBe('image/jpeg');
  });

  it('sunucu hata kodunu Türkçe gösterir', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockRejectedValue(new HttpError(413, 'CUSTOM_MEDIA_TOO_LARGE'));
    render(<CustomUploadPanel onUpload={onUpload} onSelect={() => undefined} />);

    await user.upload(screen.getByLabelText('Dosya seç'), testFile('a.png', 'image/png'));

    expect(await screen.findByRole('alert')).toHaveTextContent("Dosya 10 MB'den büyük olamaz.");
  });
});
