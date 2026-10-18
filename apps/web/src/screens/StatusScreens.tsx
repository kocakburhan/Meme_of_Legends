import { useState, type FormEvent, type ReactNode } from 'react';
import { validateNickname } from '@/lib/contracts';
import { LiveStatus } from '@/components/Countdown';
import { GhostButton, Note, PrimaryButton, Screen, TopBar } from '@/components/ui';

/** Tam ekran geçiş/durum ekranlarının ortak çerçevesi. */
function StatusShell({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Screen className={className}>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h1 className="font-display text-3xl uppercase leading-tight">{title}</h1>
        {children}
      </div>
    </Screen>
  );
}

/** Duraklatma: eylemler donmuştur; neden ve çözüm net (SPEC 12.2). */
export function PausedOverlay({ className }: { className?: string }) {
  return (
    <StatusShell title="Oyun duraklatıldı" className={className}>
      <p aria-hidden="true" className="text-5xl">
        ⏸️
      </p>
      <Note>Yönetici devam ettirene kadar bekleniyor. Seçim ve puanların güvende.</Note>
    </StatusShell>
  );
}

/** Sunucu bağlantısı kopunca (SPEC 5.5, 12.4). */
export function ReconnectingOverlay({ className }: { className?: string }) {
  return (
    <StatusShell title="Yeniden bağlanıyor" className={className}>
      <p aria-hidden="true" className="text-5xl">
        📡
      </p>
      <Note>Bağlantı kurulurken bekleniyor. Oyun durmaz; döndüğünde kaldığın yerden sürer.</Note>
    </StatusShell>
  );
}

/** Sunucu geri geldiğinde "Devam ediyoruz 3-2-1" (SPEC 12.4). */
export function ResumeCountdownOverlay({
  secondsLeft,
  className,
}: {
  secondsLeft: number;
  className?: string;
}) {
  return (
    <StatusShell title="Devam ediyoruz" className={className}>
      <LiveStatus message={`Oyun ${secondsLeft} saniye içinde devam ediyor.`} />
      <p aria-hidden="true" className="font-display text-8xl text-accent">
        {Math.max(0, secondsLeft)}
      </p>
      <Note>Kaldığın yerden devam.</Note>
    </StatusShell>
  );
}

/** Odadan atılma: aynı tarayıcıyla geri girilemez (SPEC 11.1). */
export function KickedScreen({ className }: { className?: string }) {
  return (
    <StatusShell title="Odadan atıldın" className={className}>
      <p aria-hidden="true" className="text-5xl">
        🚪
      </p>
      <Note>Yönetici seni odadan çıkardı. Bu tarayıcıyla bu odaya geri giremezsin.</Note>
    </StatusShell>
  );
}

/** Aynı kimliğe başka bir cihaz/sekme bağlandı (protokol v0.2: superseded). */
export function SupersededScreen({ className }: { className?: string }) {
  return (
    <StatusShell title="Bağlılık başka cihaza geçti" className={className}>
      <p aria-hidden="true" className="text-5xl">
        🔁
      </p>
      <Note>Oyunun bu cihazda kapatıldı; kimliğin devralındı. Bu sekmede kalmana gerek yok.</Note>
    </StatusShell>
  );
}

/** Oturum bitti ya da oda kapandı; lobi kodu geçersiz (SPEC 4.5). */
export function SessionEndedScreen({ reason }: { reason: 'sessionEnded' | 'roomExpired' }) {
  return (
    <StatusShell title="Oturum bitti">
      <p aria-hidden="true" className="text-5xl">
        🌙
      </p>
      <Note>
        {reason === 'roomExpired'
          ? 'Lobi zaman aşımına uğradı ve kapandı.'
          : 'Yönetici oturumu kapattı.'}{' '}
        Yeni oyun için işletmenin vereceği kodu kullan.
      </Note>
    </StatusShell>
  );
}

/** Onay bekleyen katılımcı: görünümde henüz listede değil (SPEC 5.2). */
export function PendingApprovalScreen({ className }: { className?: string }) {
  return (
    <StatusShell title="Onay bekleniyor" className={className}>
      <p aria-hidden="true" className="font-display text-5xl text-accent motion-safe:animate-pulse-slow">
        ⋯
      </p>
      <Note>Girişin yöneticide. Onaylanınca lobiye geçeceksin; bu sayfayı kapatma.</Note>
    </StatusShell>
  );
}

/** Cihaz devri: yeni cihaz yönetici onayı bekler (SPEC 5.5). */
export function TakeoverPendingScreen({
  nickname,
  onCancel,
  className,
}: {
  nickname: string;
  onCancel: () => void;
  className?: string;
}) {
  return (
    <StatusShell title="Devam onayı bekleniyor" className={className}>
      <p aria-hidden="true" className="font-display text-5xl text-accent motion-safe:animate-pulse-slow">
        ⋯
      </p>
      <Note>
        "{nickname}" adı başka bir cihazda kullanımda. Yönetici onaylarsa oyuna bu cihazdan devam
        edeceksin.
      </Note>
      <div className="w-full max-w-xs">
        <GhostButton onClick={onCancel}>Vazgeç</GhostButton>
      </div>
    </StatusShell>
  );
}

/** Oda kodu geçersiz ya da oda kapalı (SPEC 5.1). */
export function RoomNotFoundScreen({
  onBack,
  className,
}: {
  onBack: () => void;
  className?: string;
}) {
  return (
    <StatusShell title="Oda bulunamadı" className={className}>
      <Note>
        Kod hatalı olabilir ya da oturum kapandı. QR'ı yeniden okut; hâlâ duruyorsa kodu tekrar
        yaz.
      </Note>
      <div className="w-full max-w-xs">
        <PrimaryButton onClick={onBack}>Kod tekrar gir</PrimaryButton>
      </div>
    </StatusShell>
  );
}

/** Takma ad değişimi: yönetici sıfırladığında ya da devralınan cihazda (SPEC 11.1, 5.5). */
export function NicknameChangeScreen({
  currentNickname,
  onSubmit,
  className,
}: {
  currentNickname?: string;
  onSubmit: (nickname: string) => void;
  className?: string;
}) {
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nicknameError = validateNickname(nickname);
    if (nicknameError) {
      setError(nicknameError);
      return;
    }
    setError(null);
    onSubmit(nickname.trim());
  }

  return (
    <Screen className={className}>
      <TopBar kicker="Katılımcı" title="Takma adını değiştir" />
      <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
        <div>
          <label htmlFor="nickname-change" className="mb-1 block text-sm font-bold">
            Yeni takma ad
          </label>
          <input
            id="nickname-change"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={40}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            className="h-12 w-full rounded-md border border-line bg-surface px-3 text-base"
          />
          {error ? (
            <p role="alert" className="mt-1 text-sm text-danger">
              {error}
            </p>
          ) : (
            <Note className="mt-1">
              {currentNickname ? `Şu an: ${currentNickname}. ` : ''}2–20 karakter; harf, rakam,
              boşluk ve emoji.
            </Note>
          )}
        </div>
        <PrimaryButton type="submit">Kaydet</PrimaryButton>
      </form>
      <p className="mt-auto text-center text-xs text-muted">Rolün ve puanların korunur.</p>
    </Screen>
  );
}

/** Elenme geçişi: tek seferlik, ardından seyirci olarak devam (SPEC 9.1). */
export function EliminatedScreen({
  onContinue,
  className,
}: {
  onContinue: () => void;
  className?: string;
}) {
  return (
    <StatusShell title="Elendin!" className={className}>
      <p aria-hidden="true" className="text-5xl">
        🫡
      </p>
      <Note>Bu turda elendin; artık jürisin. Puanlamaya devam et, taht sallandı.</Note>
      <div className="w-full max-w-xs">
        <PrimaryButton onClick={onContinue}>Jüri koltuğuma geç</PrimaryButton>
      </div>
    </StatusShell>
  );
}

/** Bay geçiş: tur gönderisi yok, tarafsız puanlayıcı (SPEC 9.1). */
export function ByeScreen({ onContinue, className }: { onContinue: () => void; className?: string }) {
  return (
    <StatusShell title="Bu tur bay geçtin" className={className}>
      <p aria-hidden="true" className="text-5xl">
        🎟️
      </p>
      <Note>Gönderi yapmıyorsun; rakipleri puanlıyorsun ve sonraki tura doğrudan geçtin.</Note>
      <div className="w-full max-w-xs">
        <PrimaryButton onClick={onContinue}>Puanlamaya geç</PrimaryButton>
      </div>
    </StatusShell>
  );
}

/** Uzatma turu bilgi ekranı (SPEC 10.2). */
export function OvertimeScreen({
  inTie,
  onContinue,
  className,
}: {
  inTie: boolean;
  onContinue: () => void;
  className?: string;
}) {
  return (
    <StatusShell title="Uzatma turu!" className={className}>
      <p aria-hidden="true" className="text-5xl">
        ⚡
      </p>
      {inTie ? (
        <>
          <Note>Berabere kaldın; 30 saniyede yeni duruma meme seç.</Note>
          <div className="w-full max-w-xs">
            <PrimaryButton onClick={onContinue}>Seçime geç</PrimaryButton>
          </div>
        </>
      ) : (
        <Note>Beraberlik için uzatma turu oynanıyor; sen puanlayacaksın.</Note>
      )}
    </StatusShell>
  );
}

/** Kura ekranı: uzatma berabere kalınca kura ile çözülür (SPEC 10.2). */
export function DrawScreen({
  candidates,
  className,
}: {
  candidates: string[];
  className?: string;
}) {
  return (
    <StatusShell title="Kura çekiliyor" className={className}>
      <p aria-hidden="true" className="font-display text-3xl text-accent motion-safe:animate-shuffle">
        {candidates.join(' 🆚 ')}
      </p>
      <Note>Beraberlik kura ile çözülüyor; karar yöneticide değil, zararda.</Note>
    </StatusShell>
  );
}
