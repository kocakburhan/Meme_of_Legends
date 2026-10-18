import { expect, it } from 'vitest';

import { enginePlaceholder } from './index.js';

it('returns a greeting from the engine placeholder', () => {
  expect(enginePlaceholder('m0')).toBe('engine: m0');
});
