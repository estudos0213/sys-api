import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);

// Used for unknown emails so both login paths perform the password derivation.
export const DUMMY_PASSWORD_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(hash);
  if (!match) return false;
  const key = await deriveKey(password, match[1], 64) as Buffer;
  return timingSafeEqual(key, Buffer.from(match[2], 'hex'));
}
