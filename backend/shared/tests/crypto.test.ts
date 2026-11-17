import assert from 'node:assert/strict';
import test from 'node:test';
import { createCrypto, isGrantLive, normalizePhone } from '../src/index.js';

const config = {
  dataEncryptionKey: Buffer.alloc(32, 7).toString('base64'),
  codeDigestKey: Buffer.alloc(32, 8).toString('base64'),
  phoneDigestKey: Buffer.alloc(32, 9).toString('base64'),
  inputFingerprintKey: Buffer.alloc(32, 10).toString('base64'),
  encryptionKeyVersion: 1,
};

test('encrypt and decrypt round-trips with a purpose', () => {
  const crypto = createCrypto(config);
  const envelope = crypto.encrypt({ hello: 'world' }, 'test-purpose');
  assert.deepEqual(crypto.decrypt(envelope, 'test-purpose'), { hello: 'world' });
  assert.throws(() => crypto.decrypt(envelope, 'other-purpose'));
});

test('patient and grant digests require the contract shape', () => {
  const crypto = createCrypto(config);
  assert.match(crypto.digestCode('123456789012', 'patient') ?? '', /^[0-9a-f]{64}$/);
  assert.equal(crypto.digestCode('12345678901', 'patient'), null);
  assert.match(crypto.digestCode('12345678', 'grant') ?? '', /^[0-9a-f]{64}$/);
  assert.equal(crypto.digestCode('1234567', 'grant'), null);
});

test('grant liveness checks expiry, revocation and channel', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const live = {
    expires_at: new Date('2026-01-02T00:00:00Z'),
    revoked_at: null,
    channels: ['USSD'],
    fields: ['allergies'],
  };
  assert.equal(isGrantLive(live, 'USSD', now), true);
  assert.equal(isGrantLive(live, 'WEB_PRACTITIONER', now), false);
  assert.equal(isGrantLive({ ...live, revoked_at: now }, 'USSD', now), false);
});

test('phone normalization enforces E.164', () => {
  assert.equal(normalizePhone('+2348012345678'), '+2348012345678');
  assert.throws(() => normalizePhone('08012345678'));
});
