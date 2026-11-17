import { randomUUID } from 'node:crypto';
import { crypto } from '../config.js';
import { prisma } from '../db.js';

export interface TextSmsInput {
  logicalKey: string;
  phone: string;
  text: string;
  allowAfterStop?: boolean;
  ttlSeconds?: number;
}

/**
 * Queue a plain SMS through the shared outbox. The offline worker owns sending;
 * the online process never calls Africa's Talking directly.
 */
export async function enqueueTextSms(input: TextSmsInput) {
  const reference = {
    envelope: crypto.encrypt(input.text, 'sms-text'),
    allowAfterStop: Boolean(input.allowAfterStop),
  };
  const ttl = input.ttlSeconds ?? 3600;
  const result = await prisma.outbox.createMany({
    data: [
      {
        id: randomUUID(),
        logical_key: input.logicalKey,
        kind: 'TEXT',
        recipient_phone_envelope: crypto.encrypt(input.phone, 'sms-recipient'),
        recipient_phone_digest: crypto.digestPhone(input.phone),
        render_ref: reference,
        status: 'QUEUED',
        expires_at: new Date(Date.now() + ttl * 1000),
      },
    ],
    skipDuplicates: true,
  });
  return result.count > 0;
}
