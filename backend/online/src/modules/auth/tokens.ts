import { randomBytes } from 'node:crypto';
import type { AccountRoleType } from '@prisma/client';
import { sha256Hex } from '@healthaccess/shared';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { AppError } from '../../middleware/error.js';
import type { AccessClaims } from '../../middleware/auth.js';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_expires_in: number;
}

export interface SessionContext {
  userAgent?: string;
  ipHash?: string;
}

function newRefreshToken() {
  return randomBytes(32).toString('base64url');
}

function refreshExpiry() {
  return new Date(Date.now() + config.refreshTtlDays * 86_400_000);
}

function buildPair(
  accountId: string,
  sessionId: string,
  roles: AccountRoleType[],
  refreshToken: string,
  refreshExpiresAt: Date,
): TokenPair {
  const claims: AccessClaims = {
    sub: accountId,
    sid: sessionId,
    typ: 'access',
    roles,
  };
  const accessToken = jwt.sign(claims, config.jwtSecret, { expiresIn: config.accessTtlSeconds });
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: config.accessTtlSeconds,
    refresh_expires_in: Math.max(
      0,
      Math.floor((refreshExpiresAt.getTime() - Date.now()) / 1000),
    ),
  };
}

export async function issueSession(
  accountId: string,
  roles: AccountRoleType[],
  context: SessionContext = {},
): Promise<TokenPair> {
  const refreshToken = newRefreshToken();
  const expiresAt = refreshExpiry();
  const session = await prisma.authSession.create({
    data: {
      account_id: accountId,
      refresh_token_hash: sha256Hex(refreshToken),
      user_agent: context.userAgent ? context.userAgent.slice(0, 512) : null,
      ip_hash: context.ipHash ?? null,
      expires_at: expiresAt,
    },
  });
  return buildPair(accountId, session.id, roles, refreshToken, expiresAt);
}

export async function rotateRefreshToken(refreshToken: string): Promise<TokenPair> {
  const currentHash = sha256Hex(refreshToken);
  const session = await prisma.authSession.findUnique({
    where: { refresh_token_hash: currentHash },
    include: { account: { include: { roles: true } } },
  });

  if (
    !session ||
    session.revoked_at ||
    session.expires_at.getTime() <= Date.now() ||
    session.account.status !== 'ACTIVE'
  ) {
    throw new AppError(401, 'Invalid refresh token', 'invalid_refresh_token');
  }

  const nextToken = newRefreshToken();
  const expiresAt = refreshExpiry();
  const rotated = await prisma.authSession.updateMany({
    where: {
      id: session.id,
      refresh_token_hash: currentHash,
      revoked_at: null,
      expires_at: { gt: new Date() },
    },
    data: {
      refresh_token_hash: sha256Hex(nextToken),
      last_seen_at: new Date(),
      expires_at: expiresAt,
    },
  });

  if (rotated.count !== 1) {
    throw new AppError(401, 'Invalid refresh token', 'invalid_refresh_token');
  }

  return buildPair(
    session.account_id,
    session.id,
    session.account.roles.map((role) => role.role),
    nextToken,
    expiresAt,
  );
}

export async function revokeRefreshToken(refreshToken: string): Promise<boolean> {
  const revoked = await prisma.authSession.updateMany({
    where: { refresh_token_hash: sha256Hex(refreshToken), revoked_at: null },
    data: { revoked_at: new Date() },
  });
  return revoked.count > 0;
}

export function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  return sha256Hex(ip);
}
