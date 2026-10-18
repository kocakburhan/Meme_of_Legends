import { useEffect, useState } from 'react';

/** Ekranlarda saat yok; sadece kabuk ve önizleme sayfası tıklar. */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
