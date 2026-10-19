import { Card, Note, TopBar } from '@/components/ui';

/**
 * M5c-3 oturumunda dolacak bölüm yer tutucusu: menü tamamdır,
 * rota 404 vermez; içerik hangi parçada geleceği açıkça yazar.
 */
export function AdminStubPage({ title }: { title: string }) {
  return (
    <>
      <TopBar kicker="Admin paneli" title={title} />
      <Card>
        <Note>Bu bölüm M5c-3 oturumunda eklenecek.</Note>
      </Card>
    </>
  );
}
