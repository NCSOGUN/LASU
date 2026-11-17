import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export interface CryptoConfig {
  dataEncryptionKey: string;
  codeDigestKey: string;
  phoneDigestKey: string;
  inputFingerprintKey: string;
  encryptionKeyVersion: number;
}

export function createCrypto(config: CryptoConfig) {
  const encryptionKey = Buffer.from(config.dataEncryptionKey, 'base64');

  function digest(secret: string, purpose: string, value: string) {
    return createHmac('sha256', Buffer.from(secret, 'base64'))
      .update(`${purpose}\0${value}`)
      .digest('hex');
  }

  return {
    digestCode(value: string, kind: 'patient' | 'grant' = 'patient') {
      if (!['patient', 'grant'].includes(kind)) throw new Error('Unknown code domain');
      const code = String(value).trim();
      if (!(kind === 'patient' ? /^\d{12}$/ : /^\d{8}$/).test(code)) return null;
      return digest(config.codeDigestKey, kind, code);
    },
    digestPhone(value: string) {
      return digest(config.phoneDigestKey, 'phone', value);
    },
    fingerprint(value: string) {
      return digest(config.inputFingerprintKey, 'input', value);
    },
    encrypt(value: unknown, purpose: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
      cipher.setAAD(Buffer.from(purpose));
      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(value), 'utf8'),
        cipher.final(),
      ]);
      return [
        config.encryptionKeyVersion,
        iv.toString('base64'),
        cipher.getAuthTag().toString('base64'),
        encrypted.toString('base64'),
      ].join('.');
    },
    decrypt<T = unknown>(envelope: string, purpose: string): T {
      const [version, iv, tag, data, extra] = envelope.split('.');
      if (extra !== undefined || Number(version) !== config.encryptionKeyVersion || !data) {
        throw new Error('Unsupported encrypted envelope');
      }
      for (const part of [iv, tag, data]) {
        if (!part || Buffer.from(part, 'base64').toString('base64') !== part) {
          throw new Error('Invalid encrypted envelope');
        }
      }
      const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'base64'));
      decipher.setAAD(Buffer.from(purpose));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return JSON.parse(
        Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
          'utf8',
        ),
      );
    },
  };
}

export type Crypto = ReturnType<typeof createCrypto>;

export function constantTimeEqual(left: string | undefined, right: string | undefined) {
  const a = Buffer.from(left || '');
  const b = Buffer.from(right || '');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizePhone(value: string) {
  if (typeof value !== 'string' || !/^\+[1-9]\d{7,14}$/.test(value)) {
    throw new Error('Invalid E.164 phone');
  }
  return value;
}

export function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
