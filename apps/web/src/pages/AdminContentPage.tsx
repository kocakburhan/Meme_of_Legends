import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { listUntaggedMemes } from '@/net/admin';
import { Card, Note, TopBar } from '@/components/ui';
import { adminLoginPath, isAdminAuthError } from '@/admin/auth';

/**
 * `/admin/icerik` — İçerik bölümünün ana sayfası: alt bölümlerin girişi.
 * Hızlı etiketleme kartında etiketlenmemiş kuyruğun boyutu gösterilir.
 */

type UntaggedState =
  { state: 'loading' } | { state: 'ready'; count: number; more: boolean } | { state: 'error' };

const SECTIONS = [
  {
    to: '/admin/icerik/kutuphane',
    title: 'Meme kütüphanesi',
    note: 'Sistem içeriklerini gez; kategori ve açıklama ver, arşivle.',
  },
  {
    to: '/admin/icerik/etiketle',
    title: 'Hızlı etiketleme',
    note: 'Kuyruktaki en eski etiketlenmemiş meme’i sırayla etiketle.',
  },
  {
    to: '/admin/icerik/durumlar',
    title: 'Platform durumları',
    note: 'Durum ekle, düzenle, arşivle; azlık uyarısı buradan izlenir.',
  },
  {
    to: '/admin/icerik/isletme-durumlari',
    title: 'İşletme durumu denetimi',
    note: 'İşletmelerin kendi durumlarını engelle / engeli kaldır.',
  },
  {
    to: '/admin/icerik/kategoriler',
    title: 'Kategoriler',
    note: 'Kategori ekle, yeniden adlandır, sırala, arşivle.',
  },
];

export default function AdminContentPage() {
  const navigate = useNavigate();
  const [untagged, setUntagged] = useState<UntaggedState>({ state: 'loading' });

  useEffect(() => {
    let alive = true;
    listUntaggedMemes()
      .then((d) => {
        if (alive) setUntagged({ state: 'ready', count: d.memes.length, more: d.nextCursor !== null });
      })
      .catch((error) => {
        if (!alive) return;
        if (isAdminAuthError(error)) navigate(adminLoginPath('/admin/icerik'), { replace: true });
        else setUntagged({ state: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [navigate]);

  function queueNote(): string {
    if (untagged.state === 'loading') return 'Kuyruk kontrol ediliyor…';
    if (untagged.state === 'error') return 'Kuyruk sayısı alınamadı.';
    if (untagged.count === 0) return 'Kuyruk boş görünüyor.';
    return `Kuyrukta ${untagged.more ? '100+' : untagged.count} meme bekliyor.`;
  }

  return (
    <>
      <TopBar kicker="İçerik" title="İçerik" />
      <Note>
        Sistem içeriklerinin tek yeri: kütüphane, etiketleme, durumlar ve kategoriler. Meme eklemek
        için yerel aracı kullanılır.
      </Note>
      <ul className="flex flex-col gap-2">
        {SECTIONS.map((section) => (
          <li key={section.to}>
            <Link
              to={section.to}
              className="block rounded-md border border-line bg-surface px-3 py-3 transition-colors hover:border-accent"
            >
              <span className="block text-sm font-bold">{section.title}</span>
              <span className="block text-xs text-muted">
                {section.to === '/admin/icerik/etiketle' ? `${section.note} ${queueNote()}` : section.note}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {untagged.state === 'error' ? (
        <Card>
          <Note>Etiketlenmemiş kuyruk alınamadı; sayfayı yenile.</Note>
        </Card>
      ) : null}
    </>
  );
}
