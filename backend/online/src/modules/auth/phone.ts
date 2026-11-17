import { randomInt, randomUUID } from 'node:crypto';
import { constantTimeEqual, sha256Hex } from '@healthaccess/shared';
import { crypto } from '../../config.js';
import { prisma } from '../../db.js';
import { AppError } from '../../middleware/error.js';
import { enqueueTextSms } from '../../services/sms.js';

const OTP_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

function invalidCode() {
  return new AppError(400, 'Invalid or expired verification code', 'invalid_code');
}

export async function beginPhoneVerification(accountId: string, phone: string) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const phoneDigest = crypto.digestPhone(phone);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await tx.authChallenge.updateMany({
      where: { account_id: accountId, purpose: 'PHONE_VERIFICATION', consumed_at: null },
      data: { consumed_at: new Date() },
    });
    await tx.authChallenge.create({
      data: {
        account_id: accountId,
        purpose: 'PHONE_VERIFICATION',
        token_digest: sha256Hex(code),
        phone_digest: phoneDigest,
        delivery_target_envelope: crypto.encrypt(phone, 'auth-challenge'),
        expires_at: expiresAt,
      },
    });
  });

  try {
    await enqueueTextSms({
      logicalKey: `phone-verify:${accountId}:${randomUUID()}`,
      phone,
      text: `Your HealthAccess verification code is ${code}. It expires in 10 minutes.`,
      ttlSeconds: OTP_TTL_MS / 1000,
    });
  } catch {
    throw new AppError(503, 'Could not send verification code', 'sms_unavailable');
  }

  return { status: 'sent' as const, expires_in: OTP_TTL_MS / 1000 };
}

export async function confirmPhoneVerification(accountId: string, phone: string, code: string) {
  const phoneDigest = crypto.digestPhone(phone);
  const challenge = await prisma.authChallenge.findFirst({
    where: {
      account_id: accountId,
      purpose: 'PHONE_VERIFICATION',
      phone_digest: phoneDigest,
      consumed_at: null,
      expires_at: { gt: new Date() },
    },
    orderBy: { created_at: 'desc' },
  });

  if (!challenge || challenge.attempts >= MAX_ATTEMPTS) {
    throw invalidCode();
  }

  if (!constantTimeEqual(sha256Hex(code), challenge.token_digest)) {
    await prisma.authChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    throw invalidCode();
  }

  const verifiedAt = new Date();
  const phoneEnvelope = crypto.encrypt(phone, 'sms-recipient');

  await prisma.$transaction(async (tx) => {
    const consumed = await tx.authChallenge.updateMany({
      where: {
        id: challenge.id,
        consumed_at: null,
        attempts: { lt: MAX_ATTEMPTS },
        expires_at: { gt: new Date() },
      },
      data: { consumed_at: verifiedAt },
    });
    if (consumed.count !== 1) throw invalidCode();

    await tx.account.update({
      where: { id: accountId },
      data: { phone_digest: phoneDigest, phone_verified_at: verifiedAt },
    });

    const profile = await tx.patientProfile.upsert({
      where: { account_id: accountId },
      update: {},
      create: { account_id: accountId },
    });

    const existingLink = await tx.channelLink.findFirst({
      where: { patient_id: profile.id, phone_digest: phoneDigest },
    });

    if (existingLink) {
      await tx.channelLink.update({
        where: { id: existingLink.id },
        data: {
          phone_envelope: phoneEnvelope,
          verified_at: verifiedAt,
          revoked_at: null,
          version: { increment: 1 },
        },
      });
    } else {
      await tx.channelLink.create({
        data: {
          patient_id: profile.id,
          phone_envelope: phoneEnvelope,
          phone_digest: phoneDigest,
          verified_at: verifiedAt,
        },
      });
    }
  });

  return { verified: true as const, phone_verified_at: verifiedAt.toISOString() };
}
