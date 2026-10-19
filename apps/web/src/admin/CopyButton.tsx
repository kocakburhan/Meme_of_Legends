import { useEffect, useRef, useState } from 'react';
import { GhostButton } from '@/components/ui';

/**
 * Panoya kopyalar; başarıda kısa süre "Kopyalandı" gösterir. Pano izni yoksa
 * düğme olduğu gibi kalır (hata sessizce yutulur; metin zaten ekrandadır).
 */
export function CopyButton({
  text,
  label = 'Kopyala',
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Pano yazılamadı; düğme olduğu gibi kalır. */
    }
  }
  return (
    <GhostButton onClick={() => void copy()} className={className}>
      {copied ? 'Kopyalandı' : label}
    </GhostButton>
  );
}
