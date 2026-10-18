import { expect, it } from 'vitest';
import type { View } from '@mol/shared';
import { shouldSelect } from './decisions.js';
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
