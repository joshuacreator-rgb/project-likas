import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encodeBase32(bytes: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value: string) {
  let bits = 0;
  let buffer = 0;
  const output: number[] = [];
  for (const character of value.replace(/=+$/g, "").toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) continue;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function codeAt(secret: string, counter: number) {
  const key = decodeBase32(secret);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function generateTotpSecret() {
  return encodeBase32(randomBytes(20));
}

export function createTotpUri(secret: string, email: string) {
  return `otpauth://totp/Project%20Likas:${encodeURIComponent(email)}?secret=${secret}&issuer=Project%20Likas&algorithm=SHA1&digits=6&period=30`;
}

export function verifyTotpCode(secret: string | null | undefined, input: string, now = Date.now()) {
  if (!secret || !/^\d{6}$/.test(input.trim())) return false;
  const counter = Math.floor(now / 30_000);
  const candidate = input.trim();
  for (const offset of [-1, 0, 1]) {
    const expected = codeAt(secret, counter + offset);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(candidate))) return true;
  }
  return false;
}

export function totpCodeForTesting(secret: string, now = Date.now()) {
  return codeAt(secret, Math.floor(now / 30_000));
}
