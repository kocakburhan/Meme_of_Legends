import QRCode from 'react-qr-code';
import { cn } from '@/lib/cn';

/**
 * Katılım QR'ı (SPEC 5.1): oda kodunu içeren link kodlanır; QR ile gelen
 * kod girişi yapılmaz. İstemci tarafında SVG ile üretilir.
 */
export function QrCode({
  value,
  size = 240,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-[var(--radius-card)] bg-white p-3',
        className,
      )}
    >
      <QRCode value={value} size={size} bgColor="#FFFFFF" fgColor="#121018" />
    </div>
  );
}
