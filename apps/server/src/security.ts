import { participantTokenClaimsSchema, type ParticipantTokenClaims } from '@mol/shared';
const encoder = new TextEncoder();
const iterations = 100_000; // Workers WebCrypto PBKDF2 iteration limit.
function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
}
export function randomSecret(size = 32): string {
  return encode(crypto.getRandomValues(new Uint8Array(size)));
}
async function derive(password: string, salt: Uint8Array<ArrayBuffer>, count: number) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: count },
      key,
      256,
    ),
  );
}
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${encode(salt)}$${encode(await derive(password, salt, iterations))}`;
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const [algorithm, rounds, salt, expected, extra] = hash.split('$');
    if (
      algorithm !== 'pbkdf2-sha256' ||
      !salt ||
      !expected ||
      extra ||
      Number(rounds) !== iterations
    )
      return false;
    const actual = await derive(password, decode(salt), Number(rounds));
    const wanted = decode(expected);
    if (actual.length !== wanted.length) return false;
    let difference = 0;
    for (let i = 0; i < actual.length; i++) difference |= actual[i]! ^ wanted[i]!;
    return difference === 0;
  } catch {
    return false;
  }
}
export async function digest(value: string): Promise<string> {
  return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
async function hmacKey(secret: string) {
  if (secret.length < 32) throw new Error('TOKEN_SECRET must contain at least 32 characters');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
export async function signParticipantToken(
  claims: ParticipantTokenClaims,
  secret: string,
): Promise<string> {
  const payload = encode(
    encoder.encode(JSON.stringify(participantTokenClaimsSchema.parse(claims))),
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    encoder.encode(payload),
  );
  return `${payload}.${encode(new Uint8Array(signature))}`;
}
export async function verifyParticipantToken(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<ParticipantTokenClaims | null> {
  try {
    const [payload, signature, extra] = token.split('.');
    if (
      !payload ||
      !signature ||
      extra ||
      !(await crypto.subtle.verify(
        'HMAC',
        await hmacKey(secret),
        decode(signature),
        encoder.encode(payload),
      ))
    )
      return null;
    const claims = participantTokenClaimsSchema.parse(
      JSON.parse(new TextDecoder().decode(decode(payload))),
    );
    return claims.expiresAt > now && claims.issuedAt <= now && claims.expiresAt > claims.issuedAt
      ? claims
      : null;
  } catch {
    return null;
  }
}
