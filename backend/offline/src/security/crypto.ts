import {
  createCrypto as createSharedCrypto,
  constantTimeEqual,
  normalizePhone,
} from '@healthaccess/shared';
import type { Config } from '../config.js';

export function createCrypto(
  config: Pick<
    Config,
    | 'dataEncryptionKey'
    | 'codeDigestKey'
    | 'phoneDigestKey'
    | 'inputFingerprintKey'
    | 'encryptionKeyVersion'
  >,
) {
  return createSharedCrypto(config);
}

export type Crypto = ReturnType<typeof createCrypto>;

export { constantTimeEqual, normalizePhone };
