import { expect, it, vi } from 'vitest';
import type { View } from '@mol/shared';
import { runBotStep, shouldSelect } from './decisions.js';
it('ilk seçimde henüz gönderisi olmayan oyuncuyu seçime alır', () => {
  const view = {
    phase: { kind: 'selection' },
    participants: [
      { id: 'a', role: 'player' },
      { id: 'b', role: 'voter' },
    ],
    matches: [],
    byes: [],
    ownSubmission: null,
  } as unknown as View;
  expect(shouldSelect(view, 'a')).toBe(true);
  expect(shouldSelect(view, 'b')).toBe(false);
  expect(shouldSelect({ ...view, byes: ['a'] }, 'a')).toBe(false);
  expect(shouldSelect({ ...view, matches: [['b', 'c']] }, 'a')).toBe(false);
});

it('plans idle reconnects before act marks the bot busy and protects in-flight commands', () => {
  const bot = {
    busy: false,
    pending: { size: 0 },
    socket: { readyState: 1, close: vi.fn() },
    act: vi.fn(async () => {
      bot.busy = true;
    }),
  };
  expect(runBotStep(bot, 0.05, () => 0)).toBe(true);
  expect(bot.socket.close).toHaveBeenCalledOnce();
  expect(bot.act).not.toHaveBeenCalled();
  bot.pending.size = 1;
  expect(runBotStep(bot, 0.05, () => 0)).toBe(false);
  expect(bot.socket.close).toHaveBeenCalledOnce();
  expect(bot.act).toHaveBeenCalledOnce();
  bot.pending.size = 0;
  expect(runBotStep(bot, 0.05, () => 0)).toBe(false);
  expect(bot.socket.close).toHaveBeenCalledOnce();
  bot.busy = false;
  expect(runBotStep(bot, 0, () => 0)).toBe(false);
  bot.socket.readyState = 3;
  expect(runBotStep(bot, 0.05, () => 0)).toBe(false);
  expect(bot.socket.close).toHaveBeenCalledOnce();
});
