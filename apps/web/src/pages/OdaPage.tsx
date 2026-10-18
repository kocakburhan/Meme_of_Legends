import { useState } from 'react';
import { useParams } from 'react-router';
import { JoinScreen } from '@/screens/JoinScreen';
import { LobbyScreen } from '@/screens/LobbyScreen';
import { fakeLobbyView, fakeRoom } from '@/lib/fake';

/**
 * `/oda/:code` — katılımcı odası. M3a'da sahte veriyle: katılım → lobi.
 * M3b'de bu kabuk gerçek WebSocket bağlantısına bağlanacak.
 */
export function OdaPage() {
  const { code = '' } = useParams();
  const room = { ...fakeRoom(), code: code.toUpperCase() };
  const [joined, setJoined] = useState<{ nickname: string; role: 'player' | 'voter' } | null>(null);
  const [shareHint, setShareHint] = useState<string | null>(null);

  async function share() {
    try {
      await navigator.clipboard.writeText(room.shareUrl);
      setShareHint('Link kopyalandı.');
    } catch {
      setShareHint(room.shareUrl);
    }
    window.setTimeout(() => setShareHint(null), 2500);
  }

  if (!joined) {
    return (
      <div className="flex min-h-dvh flex-col">
        <JoinScreen
          code={room.code}
          businessName={room.businessName}
          onEnter={({ nickname, role }) => setJoined({ nickname, role })}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <LobbyScreen
        view={fakeLobbyView()}
        me={{ id: 'p1', nickname: joined.nickname, role: joined.role }}
        room={room}
        onShare={() => void share()}
        shareHint={shareHint}
      />
      <p className="pb-4 text-center text-xs text-muted">
        M3a önizlemesi: bu ekranlar sahte veriyle çalışıyor, bağlantı M3b'de geliyor.
      </p>
    </div>
  );
}
