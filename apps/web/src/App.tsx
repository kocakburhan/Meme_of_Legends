import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router';
import JoinPage from '@/pages/JoinPage';
import { Placeholder } from '@/pages/Placeholder';

function DisplayPlaceholder() {
  return <Placeholder title="Ortak ekran" note="Ortak ekran M3b'de gelecek." />;
}
function ConsolePlaceholder() {
  return <Placeholder title="Yönetici konsolu" note="Konsol M4'te gelecek." />;
}
function BusinessPlaceholder() {
  return <Placeholder title="İşletme paneli" note="İşletme paneli M4'te gelecek." />;
}
function AdminPlaceholder() {
  return <Placeholder title="Admin paneli" note="Admin paneli M5'te gelecek." />;
}
function NotFoundPage() {
  return <Placeholder title="Sayfa bulunamadı" note="Bu yol yok. Oda kodunu tekrar kontrol et." />;
}

function buildRouter() {
  const routes: RouteObject[] = [
    { path: '/', Component: JoinPage },
    { path: '/oda/:code', lazy: () => import('./pages/OdaPage').then((m) => ({ Component: m.OdaPage })) },
    { path: '/ekran', Component: DisplayPlaceholder },
    { path: '/konsol', Component: ConsolePlaceholder },
    { path: '/isletme', Component: BusinessPlaceholder },
    { path: '/admin', Component: AdminPlaceholder },
    { path: '*', Component: NotFoundPage },
  ];
  // Önizleme sayfası yalnız geliştirme derlemesinde bulunur.
  if (import.meta.env.DEV) {
    routes.splice(
      routes.length - 1,
      0,
      { path: '/dev/onizleme', lazy: () => import('./pages/DevPreviewPage').then((m) => ({ Component: m.DevPreviewPage })) },
    );
  }
  // SPA'da sunucu render yok; hidrasyon yedeği gereksiz. Uyarıyı susturmak için kök rota tanımlı.
  return createBrowserRouter([{ HydrateFallback: () => null, children: routes }]);
}

const router = buildRouter();

export default function App() {
  return <RouterProvider router={router} />;
}
