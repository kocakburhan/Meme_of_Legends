import { Card, Note, Screen } from '@/components/ui';

/** `/ekran`, `/konsol`, `/isletme`, `/admin` — şimdilik yer tutucu. */
export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <h1 className="font-display text-3xl uppercase">{title}</h1>
          <Card className="max-w-xs">
            <Note>{note}</Note>
          </Card>
          <a href="/" className="min-h-11 underline underline-offset-4">
            Ana sayfaya dön
          </a>
        </div>
      </Screen>
    </div>
  );
}
