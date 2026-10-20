import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateUuidV7(now = new Date(), entropy = randomBytes(16)): string {
  const bytes = Buffer.from(entropy);
  const timestamp = BigInt(now.getTime());
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number((timestamp >> BigInt((5 - index) * 8)) & 0xffn);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function normalizeIdentity(identity: string): string {
  const normalized = identity.trim().toLowerCase();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phone = /^\+[1-9]\d{7,14}$/;
  if (!email.test(normalized) && !phone.test(normalized)) {
    throw new Error('Enter a valid email address or international phone number');
  }
  return normalized;
}

export function createOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashOtp(identity: string, code: string, pepper: Buffer): Buffer {
  return createHmac('sha256', pepper).update(`${identity}\0${code}`).digest();
}

export function hashIdentity(identity: string, pepper: Buffer): Buffer {
  return createHmac('sha256', pepper).update(`identity\0${identity}`).digest();
}

export function hashRefreshToken(token: string): string {
  return createHmac('sha256', 'posha-refresh-token:v1').update(token).digest('hex');
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function encodeBase32(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function decodeBase32(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const character of input.toUpperCase().replace(/=+$/u, '')) {
    const digit = BASE32_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error('Invalid authenticator secret');
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function totpCounterAt(now: Date): bigint {
  return BigInt(Math.floor(now.getTime() / 30_000));
}

export function createTotp(secret: Buffer, counter: bigint): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', secret).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return (binary % 1_000_000).toString().padStart(6, '0');
}

export function verifyTotp(secret: Buffer, code: string, now: Date): bigint | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = totpCounterAt(now);
  for (const offset of [-1n, 0n, 1n]) {
    const counter = current + offset;
    if (counter < 0n) continue;
    const expected = Buffer.from(createTotp(secret, counter));
    const presented = Buffer.from(code);
    if (expected.length === presented.length && timingSafeEqual(expected, presented))
      return counter;
  }
  return null;
}

export function encryptTotpSecret(secret: Buffer, key: Buffer): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
}

export function decryptTotpSecret(envelope: Buffer, key: Buffer): Buffer {
  if (envelope.length < 29) throw new Error('Stored two-factor secret is invalid');
  const nonce = envelope.subarray(0, 12);
  const tag = envelope.subarray(12, 28);
  const ciphertext = envelope.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
