import {
  customUploadResponseSchema,
  roomCodeSchema,
  youtubeRequestSchema,
  youtubeResponseSchema,
} from '@mol/shared';
import type { z } from 'zod';

import { HttpError, request } from '@/net/http';

/**
 * Özel içerik uçları (docs/contracts/custom-content.md): ham dosya yükleme ve
 * YouTube doğrulama. Katılımcı kimliği `Authorization: Bearer` ile taşınır;
 * HTTP çerezleri de aynı kökende otomatik gönderilir.
 */

export type CustomUpload = z.infer<typeof customUploadResponseSchema>;
export type YoutubeVerification = z.infer<typeof youtubeResponseSchema>;

function safeCode(code: string): string {
  if (!roomCodeSchema.safeParse(code).success) throw new HttpError(400, 'INVALID_ROOM_CODE');
  return encodeURIComponent(code);
}

/**
 * `fetch` yükleme ilerlemesi vermediği için XHR kullanılır. Sunucu hataları
 * `{ error: { code } }` gövdesinden okunur; ağ kesintisi `NETWORK_ERROR` olur.
 */
export function uploadCustomMedia(
  code: string,
  token: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<CustomUpload> {
  const path = `/api/rooms/${safeCode(code)}/custom/uploads`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.setRequestHeader('authorization', `Bearer ${token}`);
    if (file.type) xhr.setRequestHeader('content-type', file.type);
    xhr.responseType = 'text';

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onerror = () => reject(new HttpError(0, 'NETWORK_ERROR'));
    xhr.onabort = () => reject(new HttpError(0, 'NETWORK_ERROR'));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        try {
          resolve(customUploadResponseSchema.parse(JSON.parse(xhr.responseText)));
        } catch {
          reject(new HttpError(xhr.status, 'INVALID_RESPONSE'));
        }
        return;
      }
      let codeName = `HTTP_${xhr.status}`;
      try {
        const body = JSON.parse(xhr.responseText) as { error?: { code?: string } };
        codeName = body.error?.code ?? codeName;
      } catch {
        /* Non-JSON error body. */
      }
      reject(new HttpError(xhr.status, codeName));
    };
    xhr.send(file);
  });
}

/** YouTube linkini sunucuda doğrular; süre oEmbed'den değil oynatıcıdan okunur. */
export function verifyYoutubeLink(
  code: string,
  token: string,
  url: string,
): Promise<YoutubeVerification> {
  youtubeRequestSchema.parse({ url });
  return request(`/api/rooms/${safeCode(code)}/custom/youtube`, youtubeResponseSchema, {
    method: 'POST',
    body: JSON.stringify({ url }),
    headers: { authorization: `Bearer ${token}` },
  });
}
