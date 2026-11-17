import { randomBytes } from 'node:crypto';

for (const key of ['CODE_DIGEST_KEY', 'DATA_ENCRYPTION_KEY']) {
  console.log(`${key}=${randomBytes(32).toString('base64')}`);
}
console.log(`CALLBACK_TOKEN=${randomBytes(32).toString('base64url')}`);
