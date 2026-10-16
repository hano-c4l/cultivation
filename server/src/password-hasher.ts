import { DurableObject } from "cloudflare:workers";

/** Workers WebCrypto caps PBKDF2 at 100,000 iterations. */
export const PBKDF2_ITERATIONS = 100_000;

const encoder = new TextEncoder();

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Password hashing lives in a Durable Object because the Workers Free plan allows only 10 ms CPU per
 * request, while 100k PBKDF2 iterations take ~25 ms. Durable Objects have a far higher CPU limit.
 */
export class PasswordHasher extends DurableObject {
  async hash(password: string, saltBase64: string, iterations: number): Promise<string> {
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(saltBase64), iterations },
      key,
      256,
    );
    return toBase64(bits);
  }
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
