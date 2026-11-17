import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function connectionUrl(): string | undefined {
  const value = process.env.DATABASE_URL?.trim();
  return value || undefined;
}

function createClient(url: string | undefined) {
  return new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: ['error'],
  });
}

const url = connectionUrl();

export const prisma = globalForPrisma.prisma ?? createClient(url);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export function prismaFor(databaseUrl: string): PrismaClient {
  if (url && databaseUrl === url) return prisma;
  return createClient(databaseUrl);
}

export function ownsClient(client: PrismaClient): boolean {
  return client !== prisma;
}
