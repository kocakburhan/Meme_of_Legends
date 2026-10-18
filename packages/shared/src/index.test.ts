import { expect, it } from 'vitest';

import { sharedPlaceholder } from './index.js';

it('returns a greeting from the shared placeholder', () => {
  expect(sharedPlaceholder('m0')).toBe('shared: m0');
});
