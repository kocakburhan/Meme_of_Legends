import type { SessionSummary } from '@mol/shared';
import { Badge } from '@/console/bits';
import { SESSION_STATUS_LABELS } from '@/lib/format';

/** Oturum durum rozeti: metin anlamı taşır; renk tek başına anlam vermez (16A). */
export function SessionStatusBadge({ status }: { status: SessionSummary['status'] }) {
  const tone = status === 'finished' ? 'success' : status === 'cancelled' ? 'line' : 'danger';
  return <Badge tone={tone}>{SESSION_STATUS_LABELS[status]}</Badge>;
}
