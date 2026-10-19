import { Card, Note, TopBar } from '@/components/ui';
import { PanelLayout } from '@/panel/PanelLayout';

/**
 * `/isletme/durumlar` ve `/isletme/gecmis` yer tutucuları: ortak düzen ve
 * gezinme M4c-1'de hazır; gerçek sayfalar kendi parçalarında gelir.
 */

/** Durumlarım (SPEC 6.2) — M4c-2. */
export function BusinessPromptsStubPage() {
  return (
    <PanelLayout>
      <TopBar kicker="İşletme paneli" title="Durumlarım" />
      <Card>
        <Note>Durum kütüphanen (ekle, düzenle, arşivle) M4c-2'de gelecek.</Note>
      </Card>
    </PanelLayout>
  );
}

/** Geçmiş ve oturum detayı — M4c-3. */
export function BusinessHistoryStubPage() {
  return (
    <PanelLayout>
      <TopBar kicker="İşletme paneli" title="Geçmiş" />
      <Card>
        <Note>Biten oyunların listesi ve detayları M4c-3'te gelecek.</Note>
      </Card>
    </PanelLayout>
  );
}
