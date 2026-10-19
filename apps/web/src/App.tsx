import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router';
import JoinPage from '@/pages/JoinPage';
import BusinessHomePage from '@/pages/BusinessHomePage';
import BusinessLoginPage from '@/pages/BusinessLoginPage';
import BusinessAccountPage from '@/pages/BusinessAccountPage';
import BusinessPromptsPage from '@/pages/BusinessPromptsPage';
import BusinessHistoryPage from '@/pages/BusinessHistoryPage';
import BusinessHistoryDetailPage from '@/pages/BusinessHistoryDetailPage';
import ConsolePage from '@/pages/ConsolePage';
import AdminLoginPage from '@/pages/AdminLoginPage';
import AdminOverviewPage from '@/pages/AdminOverviewPage';
import AdminBusinessesPage from '@/pages/AdminBusinessesPage';
import AdminBusinessDetailPage from '@/pages/AdminBusinessDetailPage';
import AdminContentPage from '@/pages/AdminContentPage';
import AdminMemesPage from '@/pages/AdminMemesPage';
import AdminCategoriesPage from '@/pages/AdminCategoriesPage';
import AdminPromptsPage from '@/pages/AdminPromptsPage';
import AdminBusinessPromptsPage from '@/pages/AdminBusinessPromptsPage';
import AdminTaggingPage from '@/pages/AdminTaggingPage';
import AdminSessionsPage from '@/pages/AdminSessionsPage';
import AdminSessionDetailPage from '@/pages/AdminSessionDetailPage';
import AdminUsagePage from '@/pages/AdminUsagePage';
import AdminSystemPage from '@/pages/AdminSystemPage';
import { AdminLayout } from '@/admin/AdminLayout';
import { Placeholder } from '@/pages/Placeholder';

function NotFoundPage() {
  return <Placeholder title="Sayfa bulunamadı" note="Bu yol yok. Oda kodunu tekrar kontrol et." />;
}

function buildRouter() {
  const routes: RouteObject[] = [
    { path: '/', Component: JoinPage },
    {
      path: '/oda/:code',
      lazy: () => import('./pages/OdaPage').then((m) => ({ Component: m.OdaPage })),
    },
    {
      path: '/ekran',
      lazy: () => import('./pages/EkranPage').then((m) => ({ Component: m.default })),
    },
    // Yönetici konsolu /isletme altındadır (M4b); eski /konsol yolu panele yönlenir.
    { path: '/konsol', element: <Navigate to="/isletme" replace /> },
    { path: '/isletme/giris', Component: BusinessLoginPage },
    { path: '/isletme', Component: BusinessHomePage },
    { path: '/isletme/durumlar', Component: BusinessPromptsPage },
    { path: '/isletme/gecmis', Component: BusinessHistoryPage },
    { path: '/isletme/gecmis/:id', Component: BusinessHistoryDetailPage },
    { path: '/isletme/hesap', Component: BusinessAccountPage },
    { path: '/isletme/oyun/:code', Component: ConsolePage },
    { path: '/admin/giris', Component: AdminLoginPage },
    {
      // Admin paneli (M5c-1): düzen + oturum denetimi ortaktır; bölüm sayfaları
      // alt rotalardadır. Oturum/Sistem bölümleri M5c-3'te tamamlanmıştır.
      path: '/admin',
      Component: AdminLayout,
      children: [
        { index: true, Component: AdminOverviewPage },
        { path: 'isletmeler', Component: AdminBusinessesPage },
        { path: 'isletmeler/:id', Component: AdminBusinessDetailPage },
        { path: 'oturumlar', Component: AdminSessionsPage },
        { path: 'oturumlar/kullanim', Component: AdminUsagePage },
        { path: 'oturumlar/:id', Component: AdminSessionDetailPage },
        { path: 'icerik', Component: AdminContentPage },
        { path: 'icerik/kutuphane', Component: AdminMemesPage },
        { path: 'icerik/kategoriler', Component: AdminCategoriesPage },
        { path: 'icerik/etiketle', Component: AdminTaggingPage },
        { path: 'icerik/durumlar', Component: AdminPromptsPage },
        {
          path: 'icerik/isletme-durumlari',
          Component: AdminBusinessPromptsPage,
        },
        { path: 'sistem', Component: AdminSystemPage },
      ],
    },
    { path: '*', Component: NotFoundPage },
  ];
  // Önizleme sayfası yalnız geliştirme derlemesinde bulunur.
  if (import.meta.env.DEV) {
    routes.splice(routes.length - 1, 0, {
      path: '/dev/onizleme',
      lazy: () => import('./pages/DevPreviewPage').then((m) => ({ Component: m.DevPreviewPage })),
    });
  }
  // SPA'da sunucu render yok; hidrasyon yedeği gereksiz. Uyarıyı susturmak için kök rota tanımlı.
  return createBrowserRouter([{ HydrateFallback: () => null, children: routes }]);
}

const router = buildRouter();

export default function App() {
  return <RouterProvider router={router} />;
}
