import { Card, Note, TopBar } from '@/components/ui';

/**
 * M5c-2/M5c-3 oturumlarında dolacak bölüm yer tutucusu: menü tamamdır,
 * rota 404 vermez; içerik hangi parçada geleceği açıkça yazar.
 */
export function AdminStubPage({ title, part }: { title: string; part: 'M5c-2' | 'M5c-3' }) {
  return (
    <>
      <TopBar kicker="Admin paneli" title={title} />
      <Card>
        <Note>Bu bölüm {part} oturumunda eklenecek.</Note>
      </Card>
    </>
  );
}
