import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import type { ManagerCommand, ManagerShellInfo } from '@mol/shared';
import { HttpError, getBusinessMe, getRoom, type BusinessAccount } from '@/net/http';
import { useManagerSocket } from '@/net/useRoom';
import { cn } from '@/lib/cn';
import { Card, GhostButton, Note } from '@/components/ui';
import { StatusBar } from '@/console/StatusBar';
import { GameTab } from '@/console/GameTab';
import { ParticipantsTab } from '@/console/ParticipantsTab';
import { SettingsTab } from '@/console/SettingsTab';
import { ackReasonNote } from '@/console/reasons';
import { validateRoomCode } from '@/lib/contracts';

/**
 * `/isletme/oyun/:code` — yönetici konsolu (M4b): çerezli yönetici
 * WebSocket'i + `ManagerShellInfo`. Üstte sabit durum çubuğu, altta
 * Oyun/Katılımcılar/Ayarlar sekmeleri; masaüstünde yan yana sütunlar.
 */

type Tab = 'game' | 'participants' | 'settings';

const TAB_LABELS: Record<Tab, string> = {
  game: 'Oyun',
  participants: 'Katılımcılar',
  settings: 'Ayarlar',
};

const FIRST_VIEW_TIMEOUT_MS = 10_000;

export default function ConsolePage() {
  const { code = '' } = useParams();
  const roomCode = code.toUpperCase();
  const navigate = useNavigate();

  const [account, setAccount] = useState<BusinessAccount | null>(null);
  const [authState, setAuthState] = useState<'loading' | 'ready' | 'unauth'>('loading');
  const [roomState, setRoomState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [ackNote, setAckNote] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('game');
  const [mountedAt] = useState(() => Date.now());
  // validateRoomCode geçersizken hata metni, geçerliyken null döner.
  const invalidCode = validateRoomCode(roomCode) !== null;

  useEffect(() => {
    let alive = true;
    getBusinessMe()
      .then((d) => {
        if (!alive) return;
        setAccount(d.business);
        setAuthState('ready');
      })
      .catch((error) => {
        if (!alive) return;
        setAuthState(error instanceof HttpError && error.status === 401 ? 'unauth' : 'ready');
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (invalidCode) return;
    let alive = true;
    getRoom(roomCode)
      .then(() => alive && setRoomState('ready'))
      .catch(() => alive && setRoomState('missing'));
    return () => {
      alive = false;
    };
  }, [roomCode, invalidCode]);

  const conn = useManagerSocket(roomCode, authState === 'ready' && roomState === 'ready');

  // Rematch sonrası hak düştüğü için lobide hesap yeniden okunur.
  const inLobby = conn.view?.status === 'lobby';
  useEffect(() => {
    if (!inLobby) return;
    let alive = true;
    getBusinessMe()
      .then((d) => alive && setAccount(d.business))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [inLobby]);

  useEffect(() => {
    if (!ackNote) return;
    const timer = window.setTimeout(() => setAckNote(null), 4000);
    return () => window.clearTimeout(timer);
  }, [ackNote]);

  async function run(cmd: ManagerCommand) {
    try {
      const ack = await conn.send(cmd);
      if (!ack.ok) setAckNote(ackReasonNote(ack.reason));
      return ack;
    } catch {
      setAckNote(ackReasonNote('ACK_TIMEOUT'));
      return { ok: false };
    }
  }

  async function runShell(action: Parameters<typeof conn.sendShell>[0]) {
    try {
      const ack = await conn.sendShell(action);
      if (!ack.ok) setAckNote(ackReasonNote(ack.reason));
      return ack;
    } catch {
      setAckNote(ackReasonNote('ACK_TIMEOUT'));
      return { ok: false };
    }
  }

  if (authState === 'unauth')
    return <Navigate to={`/isletme/giris?next=${encodeURIComponent(`/isletme/oyun/${roomCode}`)}`} replace />;

  if (invalidCode || roomState === 'missing')
    return (
      <Shell>
        <Card className="flex flex-col items-center gap-3 text-center">
          <h1 className="font-display text-2xl uppercase">Oda bulunamadı</h1>
          <Note>
            Kod hatalı olabilir ya da oturum kapandı. Panelde kodu tekrar kontrol et.
          </Note>
          <GhostButton onClick={() => navigate('/isletme')}>Panele dön</GhostButton>
        </Card>
      </Shell>
    );

  if (conn.view === null) {
    // conn.now her 250 ms'de tazelendiği için bu koşul yeniden hesaplanır.
    const stuck = authState === 'ready' && roomState === 'ready' && conn.now - mountedAt > FIRST_VIEW_TIMEOUT_MS;
    if (stuck)
      return (
        <Shell>
          <Card className="flex flex-col items-center gap-3 text-center">
            <h1 className="font-display text-2xl uppercase">Konsol açılamadı</h1>
            <Note>
              Bu odaya yönetici yetkin olmayabilir ya da oda kapandı. Yeniden giriş yapıp tekrar
              dene.
            </Note>
            <GhostButton onClick={() => navigate('/isletme')}>Girişe dön</GhostButton>
          </Card>
        </Shell>
      );
    return (
      <Shell>
        <Card className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p aria-hidden="true" className="font-display text-5xl text-accent motion-safe:animate-pulse-slow">
            ⋯
          </p>
          <p className="text-sm text-muted">Konsol açılıyor…</p>
        </Card>
      </Shell>
    );
  }

  const view = conn.view;
  const shell: ManagerShellInfo | null = conn.shell;
  const pendingCount = (shell?.pendingTakeovers.length ?? 0) + view.participants.filter((p) => p.status === 'pending').length;

  return (
    <div className="flex min-h-dvh flex-col">
      <h1 className="sr-only">Yönetici konsolu</h1>
      <StatusBar
        view={view}
        code={roomCode}
        now={conn.now}
        connected={conn.state === 'open'}
        shell={shell}
        onPause={() => void run({ type: 'pause' })}
        onResume={() => void run({ type: 'resume' })}
        onCreatePairCode={() => void runShell({ kind: 'createDisplayPairCode' })}
      />

      <nav aria-label="Konsol sekmeleri" className="sticky top-[132px] z-20 border-b border-line bg-background/95 px-4 py-2 lg:hidden">
        <div className="flex gap-2">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              aria-current={tab === t ? 'page' : undefined}
              onClick={() => setTab(t)}
              className={cn(
                'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 text-sm font-bold',
                tab === t ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-foreground',
              )}
            >
              {TAB_LABELS[t]}
              {t === 'participants' && pendingCount > 0 ? (
                <span className="rounded-sm bg-danger px-1.5 text-xs font-bold text-accent-ink">
                  {pendingCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </nav>

      <div className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col lg:grid lg:grid-cols-3 lg:items-start lg:gap-4 lg:px-4">
        <TabPanel id="game" active={tab === 'game'} label="Oyun">
          <GameTab
            view={view}
            code={roomCode}
            now={conn.now}
            account={account}
            send={(cmd) => run(cmd)}
            sendShell={(action) => runShell(action)}
            onAckNote={setAckNote}
          />
        </TabPanel>
        <TabPanel id="participants" active={tab === 'participants'} label="Katılımcılar">
          <ParticipantsTab
            view={view}
            now={conn.now}
            shell={shell}
            send={(cmd) => run(cmd)}
            sendShell={(action) => runShell(action)}
            onAckNote={setAckNote}
          />
        </TabPanel>
        <TabPanel id="settings" active={tab === 'settings'} label="Ayarlar">
          <SettingsTab view={view} send={(cmd) => run(cmd)} onAckNote={setAckNote} />
        </TabPanel>
      </div>

      {ackNote ? (
        <p
          role="status"
          aria-live="polite"
          className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-md border border-line bg-surface px-4 py-2 text-sm text-danger shadow-lg"
        >
          {ackNote}
        </p>
      ) : null}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-1 flex-col gap-4 px-4 pb-6 pt-6">{children}</main>;
}

function TabPanel({
  id,
  active,
  label,
  children,
}: {
  id: string;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={label}
      id={`console-${id}`}
      // Telefondan sekmeler; masaüstünde üç bölüm yan yana sütunda (PROJECT_LOG 3.3).
      className={cn(
        'flex flex-col gap-4 px-4 pb-8 pt-4 lg:px-0 lg:pt-4',
        !active && 'hidden lg:block',
      )}
    >
      {children}
    </section>
  );
}

