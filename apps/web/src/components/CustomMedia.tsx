import { createContext, useContext, type ReactNode } from 'react';

/**
 * Özel içerik medyası bağlamı (custom-content.md): oynatma yüzeyleri dosyaya
 * nasıl erişeceğini ve yüklenemeyen medyayı kime bildireceğini buradan öğrenir.
 * Katılımcı ve konsol aynı kökende otomatik giden çerezi kullanır; ortak ekran
 * Bearer ile dosyayı alıp blob URL oluşturur. Token içeren URL paylaşılmaz.
 */
export interface CustomMediaSettings {
  /** Oda kodu; `upload` adresi `/api/rooms/<code>/custom/uploads/<id>`. */
  code: string;
  /** Yalnız ortak ekranda: eşleştirme token'ı; verilirse dosya Bearer ile alınır. */
  token?: string;
  /** YouTube sesi kısık mı (SPEC 13.2); varsayılan sessiz başlatmadır. */
  muted?: boolean;
  /** Medya bir kez daha denenip yüklenemezse yüzey bunu bildirir (SPEC 12.3). */
  onMediaError?: (submissionId: string) => void;
}

const CustomMediaContext = createContext<CustomMediaSettings | null>(null);

export function CustomMediaProvider({
  settings,
  children,
}: {
  settings: CustomMediaSettings;
  children: ReactNode;
}) {
  return <CustomMediaContext.Provider value={settings}>{children}</CustomMediaContext.Provider>;
}

export function useCustomMedia(): CustomMediaSettings | null {
  return useContext(CustomMediaContext);
}

/** Yüklenen özel dosyanın aynı kökenli adresi (sözleşmedeki erişim yöntemi). */
export function uploadMediaUrl(code: string, uploadId: string): string {
  return `/api/rooms/${encodeURIComponent(code)}/custom/uploads/${encodeURIComponent(uploadId)}`;
}
