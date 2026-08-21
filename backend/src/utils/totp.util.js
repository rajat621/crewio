import crypto from 'crypto';

// RFC 4648 base32 alphabet (used by Google Authenticator / otpauth secrets)
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Encode = (buffer) => {
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }

  let output = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }

  const remainder = bits.length % 5;
  if (remainder > 0) {
    const lastChunk = bits.slice(bits.length - remainder).padEnd(5, '0');
    output += BASE32_ALPHABET[parseInt(lastChunk, 2)];
  }

  return output;
};

const base32Decode = (input) => {
  const cleaned = String(input || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of cleaned) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) continue;
    bits += value.toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }

  return Buffer.from(bytes);
};

/**
 * Generates a random base32-encoded secret suitable for Google Authenticator.
 */
export const generateTotpSecret = (byteLength = 20) => {
  return base32Encode(crypto.randomBytes(byteLength));
};

/**
 * Builds an otpauth:// URL that authenticator apps can consume, either via
 * deep link or by scanning a QR code generated from it.
 */
export const buildOtpAuthUrl = ({ secret, accountName, issuer = 'CrewControl' }) => {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
};

/**
 * Builds a URL to a public QR-code rendering service for the given
 * otpauth:// URL, so the frontend can show a scannable QR without needing a
 * QR-generation dependency on the backend.
 */
export const buildQrCodeUrl = (otpauthUrl, size = 200) => {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(otpauthUrl)}`;
};

const hotp = (secret, counter) => {
  const secretBuffer = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 1000000).padStart(6, '0');
};

/**
 * Verifies a 6-digit TOTP token against the given base32 secret, allowing a
 * small window of clock drift (default: current step +/- 1, i.e. ~30s).
 */
export const verifyTotpToken = (secret, token, { step = 30, window = 1 } = {}) => {
  const cleanToken = String(token || '').trim();
  if (!/^\d{6}$/.test(cleanToken)) return false;
  if (!secret) return false;

  const counter = Math.floor(Date.now() / 1000 / step);

  for (let errorWindow = -window; errorWindow <= window; errorWindow += 1) {
    if (hotp(secret, counter + errorWindow) === cleanToken) {
      return true;
    }
  }

  return false;
};

export default {
  generateTotpSecret,
  buildOtpAuthUrl,
  buildQrCodeUrl,
  verifyTotpToken,
};
