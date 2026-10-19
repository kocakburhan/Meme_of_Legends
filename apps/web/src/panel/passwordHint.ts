/**
 * "İlk girişte şifre değiştirme önerisi" bandının durumu (SPEC 3.1). Sunucuda
 * ilk-giriş alanı olmadığından kapatma cihazda saklanır: bant kapatılana ya da
 * şifre değişene kadar ana sayfada görünür.
 */

const KEY = 'mol:business:password-hint-dismissed';

export function passwordHintDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissPasswordHint(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* Storage yoksa bant yalnız bu oturumda kapanır. */
  }
}
