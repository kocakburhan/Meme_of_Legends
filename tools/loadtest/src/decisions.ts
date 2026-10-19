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

/** Schedule intentional disconnects before act() can mark an otherwise idle bot busy. */
export function runBotStep(
  bot: {
    busy: boolean;
    pending: { size: number };
    socket?: { readyState: number; close(): void };
    act(): Promise<void>;
  },
  reconnectRate: number,
  random: () => number = Math.random,
): boolean {
  // Do not turn a planned outage into an artificial lost-command error.
  if (
    bot.socket?.readyState === 1 &&
    !bot.busy &&
    bot.pending.size === 0 &&
    random() < reconnectRate / 20
  ) {
    bot.socket.close();
    return true;
  }
  void bot.act();
  return false;
}
