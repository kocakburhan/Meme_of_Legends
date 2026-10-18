import { useId, useState, type FormEvent } from 'react';
import type { JoinInput, JoinRole } from '@/lib/contracts';
import { validateNickname, validateRoomCode } from '@/lib/contracts';
import { cn } from '@/lib/cn';
import { Card, Note, PrimaryButton, Screen } from '@/components/ui';

const ROLES: Array<{ value: JoinRole; title: string; description: string }> = [
  { value: 'player', title: 'Oyuncu', description: 'Her tura meme gönderir, puan da verir.' },
  { value: 'voter', title: 'Seyirci', description: 'Gönderi yapmaz, puanlar.' },
];

/**
 * Katılım ekranı: oda kodu (girilmediyse) + işletme adı, takma ad, rol kartları.
 * Oyun başladıysa oyuncu kartı pasiftir (SPEC 5.2).
 */
export function JoinScreen({
  code = null,
  businessName = null,
  allowPlayer = true,
  onEnter,
  className,
}: {
  code?: string | null;
  businessName?: string | null;
  allowPlayer?: boolean;
  onEnter: (input: JoinInput) => void;
  className?: string;
}) {
  const [codeText, setCodeText] = useState('');
  const [nickname, setNickname] = useState('');
  const [role, setRole] = useState<JoinRole>(allowPlayer ? 'player' : 'voter');
  const [error, setError] = useState<string | null>(null);
  const nicknameId = useId();
  const errorId = useId();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!code) {
      const codeError = validateRoomCode(codeText);
      if (codeError) {
        setError(codeError);
        return;
      }
    }
    const nicknameError = validateNickname(nickname);
    if (nicknameError) {
      setError(nicknameError);
      return;
    }
    setError(null);
    const chosenRole: JoinRole = !allowPlayer && role === 'player' ? 'voter' : role;
    onEnter({ code: code ? null : codeText.trim().toUpperCase(), nickname: nickname.trim(), role: chosenRole });
  }

  return (
    <Screen className={className}>
      <div>
        <h1 className="font-display text-4xl uppercase leading-none">
          Meme <span className="text-accent">of</span> Legends
        </h1>
        <p className="mt-1 text-sm text-muted">Odaya katıl, oyuna hazırlan.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {code ? (
          <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Oda</p>
              <p className="font-display text-2xl tracking-widest text-accent">{code}</p>
            </div>
            {businessName ? <p className="text-sm text-muted">{businessName}</p> : null}
          </div>
        ) : (
          <div>
            <label htmlFor="room-code" className="mb-1 block text-sm font-bold">
              Oda kodu
            </label>
            <input
              id="room-code"
              name="roomCode"
              value={codeText}
              onChange={(e) => setCodeText(e.target.value.toUpperCase())}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={6}
              placeholder="ABC123"
              className="h-12 w-full rounded-md border border-line bg-surface px-3 font-display text-2xl tracking-widest uppercase placeholder:text-muted"
            />
          </div>
        )}

        <div>
          <label htmlFor="nickname" className="mb-1 block text-sm font-bold">
            Takma adın
          </label>
          <input
            id="nickname"
            name="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            inputMode="text"
            autoComplete="off"
            maxLength={40}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : `${nicknameId}-hint`}
            className="h-12 w-full rounded-md border border-line bg-surface px-3 text-base"
          />
          {error ? (
            <p id={errorId} role="alert" className="mt-1 text-sm text-danger">
              {error}
            </p>
          ) : (
            <p id={`${nicknameId}-hint`} className="mt-1 text-sm text-muted">
              2–20 karakter; harf, rakam, boşluk ve emoji. Adın oyun sonunda anonimleşir.{' '}
              <a href="#" className="underline decoration-line underline-offset-2">
                Aydınlatma metni
              </a>
            </p>
          )}
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-bold">Rolünü seç</legend>
          <div role="radiogroup" aria-label="Rol" className="grid grid-cols-2 gap-2">
            {ROLES.map((option) => {
              const optionDisabled = option.value === 'player' && !allowPlayer;
              return (
                <label
                  key={option.value}
                  className={cn(
                    'flex cursor-pointer flex-col gap-0.5 rounded-[var(--radius-card)] border p-3 transition-colors',
                    role === option.value && !optionDisabled
                      ? 'border-accent bg-accent/10'
                      : 'border-line bg-surface hover:border-accent',
                    optionDisabled && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <input
                    type="radio"
                    name="role"
                    value={option.value}
                    checked={role === option.value}
                    disabled={optionDisabled}
                    onChange={() => setRole(option.value)}
                    className="sr-only"
                  />
                  <span className="font-display text-lg uppercase">{option.title}</span>
                  <span className="text-xs leading-snug text-muted">
                    {optionDisabled ? 'Oyun başladı; artık oyuncu olamazsın.' : option.description}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <PrimaryButton type="submit">Odaya gir</PrimaryButton>
      </form>

      <Card className="border-dashed">
        <Note>
          Oyun başlayınca durum gelir; sen meme seçersin, herkes puanlar. Seyirci olarak da
          puanlayabilirsin.
        </Note>
      </Card>
    </Screen>
  );
}
