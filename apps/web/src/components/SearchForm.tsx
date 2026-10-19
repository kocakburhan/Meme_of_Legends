import { useState, type FormEvent } from 'react';
import { GhostButton } from './ui';

/**
 * Liste sayfalarının ortak arama formu: etiketin altında tek giriş alanı,
 * yanında içerik genişliğinde "Ara" (ve sorgu varken "Temizle") düğmeleri.
 * Düğmeler `wide={false}` geçer; alan esnek satırda çökmeden yerini alır.
 */
export function SearchForm({
  id,
  ariaLabel,
  label = 'Ara',
  placeholder,
  maxLength = 200,
  onSubmit,
}: {
  /** Girişin kimliği; etiket bununla eşleşir. */
  id: string;
  /** Formun erişilebilirlik adı (ör. "İşletme ara"). */
  ariaLabel: string;
  label?: string;
  placeholder?: string;
  maxLength?: number;
  /** Kırpılmış sorguyla çağrılır; boş sorgu aramayı temizlemektir. */
  onSubmit: (query: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const active = draft.trim().length > 0;
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(draft.trim());
  }
  return (
    <form onSubmit={handleSubmit} role="search" aria-label={ariaLabel} className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="mb-1 block text-sm font-bold">
          {label}
        </label>
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          className="h-12 w-full min-w-0 rounded-md border border-line bg-background px-3 text-base"
        />
      </div>
      <GhostButton type="submit" wide={false} className="min-h-12 px-4 text-sm">
        {label}
      </GhostButton>
      {active ? (
        <GhostButton
          wide={false}
          className="min-h-12 px-4 text-sm"
          onClick={() => {
            setDraft('');
            onSubmit('');
          }}
        >
          Temizle
        </GhostButton>
      ) : null}
    </form>
  );
}
