import { useEffect, useState } from 'react';
import { HttpError, getBusinessMe, type BusinessAccount } from '@/net/http';

/**
 * Panel sayfalarının ortak hesap yükü: `GET /api/business/me`. Oturum düşmüşse
 * `status: 'unauth'` döner; sayfa bunu `/isletme/giris?next=…` yönlendirmesine
 * çevirir. Diğer hatalar sayfada yüklenemedi notu olarak gösterilir.
 */
export function useBusinessAccount() {
  const [account, setAccount] = useState<BusinessAccount | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unauth' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    getBusinessMe()
      .then((d) => {
        if (!alive) return;
        setAccount(d.business);
        setStatus('ready');
      })
      .catch((error) => {
        if (!alive) return;
        setStatus(error instanceof HttpError && error.status === 401 ? 'unauth' : 'error');
      });
    return () => {
      alive = false;
    };
  }, []);

  return { account, status, setAccount };
}
