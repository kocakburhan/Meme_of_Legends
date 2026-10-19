import { sweepCustomUploads } from './custom-media';
import { serveMedia } from './media';
import { pairDisplay } from './display-pairing';
import { RoomDurableObject } from './room';
import { ApiFailure, authRoute, json } from './auth';
import { adminRoute } from './admin';
import { businessRoute, expireLobbies, libraryRoute, roomRoute, roomStub } from './rooms';
export { RoomDurableObject };
export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        const origin = request.headers.get('origin');
        if (
          (origin && origin !== url.origin) ||
          request.headers.get('sec-fetch-site') === 'cross-site'
        )
          throw new ApiFailure(403, 'INVALID_ORIGIN');
      }
      const path = url.pathname;
      if (path.startsWith('/media/')) return await serveMedia(request, env, path);
      if (path === '/health') {
        if (request.method !== 'GET') throw new ApiFailure(405, 'METHOD_NOT_ALLOWED');
        return json({ ok: true });
      }
      const auth = /^\/api\/auth\/(admin|business)\/(login|logout|password)$/.exec(path);
      if (auth) {
        if (request.method !== 'POST') throw new ApiFailure(405, 'METHOD_NOT_ALLOWED');
        return await authRoute(request, env, auth[1] as 'admin' | 'business', auth[2]!);
      }
      if (path.startsWith('/api/admin/')) return await adminRoute(request, env, path);
      if (path.startsWith('/api/business/')) return await businessRoute(request, env, path);
      if (path === '/api/display/pair') {
        if (request.method !== 'POST') throw new ApiFailure(405, 'METHOD_NOT_ALLOWED');
        return await pairDisplay(request, env);
      }
      const takeover = /^\/api\/rooms\/([^/]+)\/takeover$/.exec(path);
      if (takeover) {
        if (request.method !== 'POST') throw new ApiFailure(405, 'METHOD_NOT_ALLOWED');
        return await roomStub(env, takeover[1]!).fetch(request);
      }
      const library = /^\/api\/rooms\/([^/]+)\/library$/.exec(path);
      if (library) return await libraryRoute(request, env, library[1]!);
      const custom = /^\/api\/rooms\/([^/]+)\/custom\/(uploads(?:\/[^/]+)?|youtube|errors)$/.exec(
        path,
      );
      if (custom) return await roomStub(env, custom[1]!).fetch(request);
      const socket = /^\/api\/rooms\/([^/]+)\/ws$/.exec(path);
      if (socket) return await roomStub(env, socket[1]!).fetch(request);
      const room = /^\/api\/rooms\/([^/]+)(\/join)?$/.exec(path);
      if (room) return await roomRoute(request, env, room[1]!, Boolean(room[2]));
      throw new ApiFailure(404, 'NOT_FOUND');
    } catch (error) {
      if (error instanceof ApiFailure)
        return json({ error: { code: error.code, ...error.details } }, error.status);
      console.error('Unhandled server error', error);
      return json({ error: { code: 'INTERNAL_ERROR' } }, 500);
    }
  },
  async scheduled(_controller: ScheduledController, env: Cloudflare.Env): Promise<void> {
    await expireLobbies(env);
    await sweepCustomUploads(env);
  },
} satisfies ExportedHandler<Cloudflare.Env>;
