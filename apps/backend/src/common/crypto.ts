import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

const BCRYPT_SALT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

export function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateApiKey(): {
  rawKey: string;
  hash: string;
  prefix: string;
} {
  const random = randomBytes(24).toString('hex');
  const rawKey = `hp_${random}`;
  const hash = createHash('sha256').update(rawKey).digest('hex');
  const prefix = rawKey.substring(0, 11); // "hp_" + first 8 chars
  return { rawKey, hash, prefix };
}
