import type { AccountRoleType } from '@prisma/client';
import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { AppError } from './error.js';

export interface AccessClaims {
  sub: string;
  sid: string;
  typ: 'access';
  roles: AccountRoleType[];
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AppError(401, 'Authentication required', 'unauthorized'));
    return;
  }

  let claims: AccessClaims;
  try {
    claims = jwt.verify(header.slice(7), config.jwtSecret) as AccessClaims;
  } catch {
    next(new AppError(401, 'Authentication required', 'unauthorized'));
    return;
  }

  if (claims.typ !== 'access' || !claims.sub || !claims.sid) {
    next(new AppError(401, 'Authentication required', 'unauthorized'));
    return;
  }

  const session = await prisma.authSession.findFirst({
    where: {
      id: claims.sid,
      account_id: claims.sub,
      revoked_at: null,
      expires_at: { gt: new Date() },
    },
    include: { account: { include: { roles: true } } },
  });

  if (!session || session.account.status !== 'ACTIVE') {
    next(new AppError(401, 'Authentication required', 'unauthorized'));
    return;
  }

  req.auth = {
    accountId: session.account_id,
    sessionId: session.id,
    roles: session.account.roles.map((role) => role.role),
  };

  void prisma.authSession
    .update({ where: { id: session.id }, data: { last_seen_at: new Date() } })
    .catch(() => undefined);

  next();
};

export function requireRole(...roles: AccountRoleType[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new AppError(401, 'Authentication required', 'unauthorized'));
      return;
    }
    if (!req.auth.roles.some((role) => roles.includes(role))) {
      next(new AppError(403, 'Insufficient role', 'forbidden'));
      return;
    }
    next();
  };
}
