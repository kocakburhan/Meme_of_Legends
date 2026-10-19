import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router';
import JoinPage from '@/pages/JoinPage';
import BusinessHomePage from '@/pages/BusinessHomePage';
import BusinessLoginPage from '@/pages/BusinessLoginPage';
import BusinessAccountPage from '@/pages/BusinessAccountPage';
import BusinessPromptsPage from '@/pages/BusinessPromptsPage';
import { BusinessHistoryStubPage } from '@/pages/BusinessStubPages';
import ConsolePage from '@/pages/ConsolePage';
import { Placeholder } from '@/pages/Placeholder';

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
    { path: '/ekran', lazy: () => import('./pages/EkranPage').then((m) => ({ Component: m.default })) },
    // Yönetici konsolu /isletme altındadır (M4b); eski /konsol yolu panele yönlenir.
    { path: '/konsol', element: <Navigate to="/isletme" replace /> },
    { path: '/isletme/giris', Component: BusinessLoginPage },
    { path: '/isletme', Component: BusinessHomePage },
    { path: '/isletme/durumlar', Component: BusinessPromptsPage },
    { path: '/isletme/gecmis', Component: BusinessHistoryStubPage },
    { path: '/isletme/hesap', Component: BusinessAccountPage },
    { path: '/isletme/oyun/:code', Component: ConsolePage },
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
