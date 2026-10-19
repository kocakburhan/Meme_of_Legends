import { Card, Note, TopBar } from '@/components/ui';
import { PanelLayout } from '@/panel/PanelLayout';

/** `/isletme/gecmis` yer tutucusu: ortak düzen ve gezinme M4c-1'de hazır; gerçek sayfa M4c-3'te gelir. */
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
