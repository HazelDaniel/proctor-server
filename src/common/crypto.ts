import { createHash, randomBytes } from 'crypto';

export function sha256Hex(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

export function newToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}
