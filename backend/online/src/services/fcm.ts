import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import admin from 'firebase-admin';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushDeliveryResult {
  enabled: boolean;
  sent: number;
  failed: number;
  invalidTokens: string[];
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

const MULTICAST_CHUNK_SIZE = 500;

let messagingPromise: Promise<admin.messaging.Messaging | null> | undefined;
let noOpLogged = false;

function logNoOpOnce(reason: string) {
  if (noOpLogged) return;
  noOpLogged = true;
  logger.info({ reason }, 'FCM disabled; push notifications are a no-op');
}

async function loadServiceAccount(raw: string): Promise<admin.ServiceAccount> {
  const value = raw.trim();
  if (value.startsWith('{')) {
    return JSON.parse(value) as admin.ServiceAccount;
  }
  if (!isAbsolute(value)) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT must be an absolute path or JSON object');
  }
  return JSON.parse(await readFile(value, 'utf8')) as admin.ServiceAccount;
}

async function initMessaging(): Promise<admin.messaging.Messaging | null> {
  if (!config.fcmEnabled) {
    logNoOpOnce('FCM_ENABLED is false');
    return null;
  }
  if (!config.firebaseServiceAccount) {
    logNoOpOnce('FIREBASE_SERVICE_ACCOUNT is not configured');
    return null;
  }

  try {
    if (!admin.apps.length) {
      const serviceAccount = await loadServiceAccount(config.firebaseServiceAccount);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    return admin.messaging();
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'unknown' },
      'FCM initialization failed; push notifications are disabled',
    );
    return null;
  }
}

function getMessaging(): Promise<admin.messaging.Messaging | null> {
  messagingPromise ??= initMessaging();
  return messagingPromise;
}

function invalidTokenCode(code: string | undefined) {
  return Boolean(code && INVALID_TOKEN_CODES.has(code));
}

async function pruneInvalidTokens(tokens: string[]) {
  if (!tokens.length) return;
  try {
    await prisma.notificationToken.deleteMany({ where: { token: { in: tokens } } });
    logger.info({ count: tokens.length }, 'pruned invalid notification tokens');
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : 'unknown' },
      'failed to prune invalid notification tokens',
    );
  }
}

export async function sendPushToTokens(
  tokens: string[],
  message: PushMessage,
): Promise<PushDeliveryResult> {
  const unique = [...new Set(tokens.filter((token) => token.length > 0))];
  const messaging = await getMessaging();

  if (!messaging) {
    logNoOpOnce(config.fcmEnabled ? 'FCM is not configured' : 'FCM_ENABLED is false');
    return { enabled: false, sent: 0, failed: 0, invalidTokens: [] };
  }
  if (!unique.length) {
    return { enabled: true, sent: 0, failed: 0, invalidTokens: [] };
  }

  const data = message.data
    ? Object.fromEntries(Object.entries(message.data).map(([key, value]) => [key, String(value)]))
    : undefined;

  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  for (let offset = 0; offset < unique.length; offset += MULTICAST_CHUNK_SIZE) {
    const chunk = unique.slice(offset, offset + MULTICAST_CHUNK_SIZE);
    try {
      const response = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title: message.title, body: message.body },
        ...(data ? { data } : {}),
      });
      sent += response.successCount;
      failed += response.failureCount;
      response.responses.forEach((result, index) => {
        if (!result.success && invalidTokenCode(result.error?.code)) {
          const token = chunk[index];
          if (token) invalidTokens.push(token);
        }
      });
    } catch (error) {
      failed += chunk.length;
      logger.warn(
        { err: error instanceof Error ? error.message : 'unknown', count: chunk.length },
        'FCM multicast send failed',
      );
    }
  }

  await pruneInvalidTokens(invalidTokens);
  logger.info({ sent, failed, invalid: invalidTokens.length }, 'FCM multicast completed');
  return { enabled: true, sent, failed, invalidTokens };
}

export function resetFcmForTests() {
  messagingPromise = undefined;
  noOpLogged = false;
}
