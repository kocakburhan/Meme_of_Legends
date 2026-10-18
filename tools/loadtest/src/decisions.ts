import type { View } from '@mol/shared';
export function shouldSelect(view: View, id: string, manager?: View): boolean {
  return (
    view.phase.kind === 'selection' &&
    view.participants.some((p) => p.id === id && p.role === 'player') &&
    (manager?.stage.contenders?.includes(id) ?? true) &&
    (!view.matches.length || view.matches.flat().includes(id)) &&
    !view.byes.includes(id) &&
    !view.ownSubmission?.confirmed
  );
}
