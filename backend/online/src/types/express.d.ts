import type { AccountRoleType } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        accountId: string;
        sessionId: string;
        roles: AccountRoleType[];
      };
      requestId: string;
    }
  }
}

export {};
