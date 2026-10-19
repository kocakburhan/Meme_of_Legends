import { HttpError } from '@/net/http';

/**
 * Admin oturumu yardımcıları: oturum düşünce sayfalar `?next=` ile
 * `/admin/giris`'e yönlenir (görev notu, M5c-1).
 */

export function adminLoginPath(next: string): string {
  return `/admin/giris?next=${encodeURIComponent(next)}`;
}

export function isAdminAuthError(error: unknown): boolean {
  return error instanceof HttpError && error.status === 401;
}
