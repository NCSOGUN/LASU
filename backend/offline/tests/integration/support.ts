import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { loadConfig } from '../../src/config.js';
import { createCrypto } from '../../src/security/crypto.js';
import { Repository } from '../../src/repository.js';

export const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

export function hasDatabase(): boolean {
  return Boolean(databaseUrl);
}

export function testConfig() {
  return loadConfig({
    DATABASE_URL: databaseUrl!,
    NODE_ENV: 'test',
    CALLBACK_TOKEN: randomBytes(32).toString('base64url'),
    CODE_DIGEST_KEY: randomBytes(32).toString('base64'),
    DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  });
}

export async function createHarness() {
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl! } },
  });
  await prisma.$queryRaw`SELECT 1`;
  const config = testConfig();
  const crypto = createCrypto(config);
  const repository = new Repository(config, crypto, prisma);
  const prefix = randomUUID();
  const phone = `+2348${String(Math.floor(Math.random() * 10_000_000_000)).padStart(10, '0')}`;
  const phoneDigest = crypto.digestPhone(phone);
  return {
    prisma,
    config,
    crypto,
    repository,
    prefix,
    phone,
    phoneDigest,
    async close() {
      await repository.close();
      await prisma.$disconnect();
    },
  };
}

export function uniqueSuffix(prefix: string): string {
  return prefix.replaceAll('-', '').slice(0, 10);
}
