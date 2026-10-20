import { useEffect, useId, useRef, useState } from 'react';
import type { MediaRef } from '@mol/engine';

import { MemeFrame } from '@/components/MemeFrame';
import { GhostButton, Note, PrimaryButton, ProgressBar } from '@/components/ui';
import {
  CUSTOM_UPLOAD_ACCEPT,
  MAX_CUSTOM_UPLOAD_BYTES,
  checkUploadFile,
  uploadErrorMessage,
} from '@/lib/custom';
import { HttpError } from '@/net/http';
import type { CustomUpload } from '@/net/custom';

/**
 * "Yükle" sekmesi (SPEC 7.1): yerel ön kontrol → ilerlemeli yükleme →
 * sunucunun `previewUrl` önizlemesi → mevcut `select` akışına devir.
 * Video dosyası kabul edilmez; YouTube sekmesine yönlendirilir.
 */
export function CustomUploadPanel({
  onUpload,
  onSelect,
}: {
  onUpload: (file: File, onProgress: (percent: number) => void) => Promise<CustomUpload>;
  onSelect: (media: MediaRef) => void;
}) {
  const fileInputId = useId();
  const errorId = useId();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [upload, setUpload] = useState<CustomUpload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(false);
  const requestRef = useRef(0);

  useEffect(
    () => () => {
      // Sekme değişince geç dönen yanıt yeni durumu ezmesin.
      requestRef.current += 1;
    },
    [],
  );

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const check = checkUploadFile(file);
    if (!check.ok) {
      setError(check.message);
      setUpload(null);
      setSelected(false);
      return;
    }
    const request = requestRef.current + 1;
    requestRef.current = request;
    setError(null);
    setUpload(null);
    setSelected(false);
    setProgress(0);
    setUploading(true);
    const normalized =
      file.type === check.mime ? file : new File([file], file.name, { type: check.mime });
    try {
      const result = await onUpload(normalized, (percent) => {
        if (requestRef.current === request) setProgress(percent);
      });
      if (requestRef.current !== request) return;
      setUpload(result);
    } catch (failure) {
      if (requestRef.current !== request) return;
      setError(uploadErrorMessage(failure instanceof HttpError ? failure.code : 'NETWORK_ERROR'));
    } finally {
      if (requestRef.current === request) setUploading(false);
    }
  }

  function choose() {
    if (!upload) return;
    onSelect({
      source: 'upload',
      uploadId: upload.uploadId,
      mediaType: upload.mediaType,
    });
    setSelected(true);
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-dashed border-line bg-surface p-4 text-center">
        <p className="font-display text-lg uppercase">Kendi resmin ya da GIF'in</p>
        <Note>JPG, PNG, WebP veya GIF; en fazla 10 MB. Telefonda galeri veya kamera açılır.</Note>
        <label
          htmlFor={fileInputId}
          className="mx-auto flex min-h-12 w-full max-w-72 cursor-pointer items-center justify-center rounded-md border border-line bg-surface-raised px-4 font-bold transition-colors hover:border-accent focus-within:outline focus-within:outline-2 focus-within:outline-accent aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          aria-disabled={uploading}
        >
          {upload ? 'Başka dosya seç' : 'Dosya seç'}
          <input
            id={fileInputId}
            type="file"
            accept={CUSTOM_UPLOAD_ACCEPT}
            disabled={uploading}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              void handleFile(file);
            }}
            className="sr-only"
          />
        </label>
      </div>

      {uploading ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <ProgressBar
            value={progress}
            max={100}
            label="Yükleme ilerlemesi"
            className="[&_span]:text-foreground"
          />
          <p role="status" className="mt-2 text-center text-sm text-muted">
            Yükleniyor… %{progress}
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      {upload ? (
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-3">
          <MemeFrame
            media={{
              source: 'upload',
              uploadId: upload.uploadId,
              mediaType: upload.mediaType,
            }}
            src={upload.previewUrl}
            title="Yüklediğin içerik"
            className="aspect-video w-full flex-none"
          />
          <Note className="text-center">
            Bu içerik seçim boyunca yalnız sana görünür; gösterimde anonim olur.
          </Note>
          <PrimaryButton onClick={choose}>
            {selected ? 'Seçimi yeniden gönder' : 'Bu içeriği seç'}
          </PrimaryButton>
          {selected ? (
            <p role="status" className="text-center text-sm text-success">
              Seçim gönderildi; alttaki “Seçimimi onayla” ile kesinleştir.
            </p>
          ) : null}
        </div>
      ) : null}

      <GhostButton
        wide
        onClick={() => {
          setUpload(null);
          setError(null);
          setSelected(false);
          setProgress(0);
        }}
        disabled={!upload && !error}
      >
        Temizle
      </GhostButton>

      <Note className="text-center">
        Yükleme onayı seçim değildir; en fazla {MAX_CUSTOM_UPLOAD_BYTES / (1024 * 1024)} MB.
      </Note>
    </div>
  );
}
