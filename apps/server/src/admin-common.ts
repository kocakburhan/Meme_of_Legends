import { z } from 'zod';
import { ApiFailure } from './auth';
export function audit(action: string, targetId: string, details: unknown) {
  return { id: crypto.randomUUID(), occurredAt: Date.now(), action, targetId, details };
}
export function query<T>(request: Request, schema: z.ZodType<T>): T {
  const result = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!result.success) throw new ApiFailure(400, 'INVALID_REQUEST');
  return result.data;
}
const cursorSchema = z.strictObject({
  time: z.number().int().nonnegative(),
  id: z.string().min(1),
  scope: z.string(),
});
export function cursorPage(request: Request, cursor?: string) {
  const url = new URL(request.url);
  url.searchParams.delete('cursor');
  url.searchParams.delete('limit');
  url.searchParams.sort();
  const scope = url.pathname + url.search;
  let after: z.infer<typeof cursorSchema> | undefined;
  if (cursor) {
    try {
      after = cursorSchema.parse(
        JSON.parse(
          new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
            Uint8Array.from(atob(cursor), (c) => c.charCodeAt(0)),
          ),
        ),
      );
      if (after.scope !== scope) throw new Error('scope');
    } catch {
      throw new ApiFailure(400, 'INVALID_REQUEST');
    }
  }
  return {
    after,
    next: (row: { id: string }, time: number) =>
      btoa(
        String.fromCharCode(
          ...new TextEncoder().encode(JSON.stringify({ time, id: row.id, scope })),
        ),
      ),
  };
}
export function uniqueFailure(error: unknown) {
  return `${error} ${(error as Error).cause}`.includes('UNIQUE');
}
