import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createCrypto, constantTimeEqual, normalizePhone } from '../src/security/crypto.js';

function environment(): Record<string, string> {
  return {
    DATABASE_URL: 'postgresql://localhost/unused',
    CALLBACK_TOKEN: 'a'.repeat(32),
    ...Object.fromEntries(
      ['CODE_DIGEST_KEY', 'DATA_ENCRYPTION_KEY'].map((key) => [
        key,
        randomBytes(32).toString('base64'),
      ]),
    ),
  };
}

test('configuration refuses unsafe production and incomplete secrets', () => {
  assert.throws(() => loadConfig({}), /CODE_DIGEST_KEY/);
  assert.throws(
    () => loadConfig({ ...environment(), NODE_ENV: 'production' }),
    /Production requires/,
  );
  assert.throws(() => loadConfig({ ...environment(), OPENROUTER_API_KEY: 'key' }), /Set both/);
  const env = environment();
  assert.throws(
    () => loadConfig({ ...env, DATA_ENCRYPTION_KEY: env.CODE_DIGEST_KEY }),
    /independent/,
  );
});

test('envelopes are randomized, authenticated and purpose-bound', () => {
  const crypto = createCrypto(loadConfig(environment()));
  const value = { phone: '+2348000000000', text: 'LOOKUP 123456789012' };
  const first = crypto.encrypt(value, 'sms-inbox');
  assert.notEqual(first, crypto.encrypt(value, 'sms-inbox'));
  assert.ok(!first.includes(value.phone));
  assert.deepEqual(crypto.decrypt(first, 'sms-inbox'), value);
  assert.throws(() => crypto.decrypt(first, 'sms-outbox'));
  assert.throws(() => crypto.decrypt(first.replace(/.$/, 'x'), 'sms-inbox'));
});

test('code domains and phone fingerprints are stable and private', () => {
  const crypto = createCrypto(loadConfig(environment()));
  assert.equal(crypto.digestCode('123456789012')?.length, 64);
  assert.equal(crypto.digestCode('12345678', 'grant')?.length, 64);
  assert.equal(crypto.digestCode('12345678'), null);
  assert.equal(crypto.digestCode('bad', 'grant'), null);
  assert.equal(crypto.digestPhone('+2348000000000'), crypto.digestPhone('+2348000000000'));
  assert.notEqual(crypto.fingerprint('12345678'), crypto.digestCode('12345678', 'grant'));
  assert.equal(normalizePhone('+2348000000000'), '+2348000000000');
  assert.throws(() => normalizePhone('08000000000'));
  assert.equal(constantTimeEqual('secret', 'secret'), true);
  assert.equal(constantTimeEqual('secret', 'other'), false);
});
