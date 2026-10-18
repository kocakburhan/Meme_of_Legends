import { exports } from 'cloudflare:workers';
import { expect, it } from 'vitest';

it('GET /health responds with { ok: true }', async () => {
  const response = await exports.default.fetch('https://example.com/health');

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

it('GET /unknown responds with 404', async () => {
  const response = await exports.default.fetch('https://example.com/unknown');

  expect(response.status).toBe(404);
});
