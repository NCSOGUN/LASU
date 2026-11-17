import { OAuth2Client } from 'google-auth-library';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { AppError } from '../../middleware/error.js';
import { issueSession, type SessionContext } from './tokens.js';

const SCOPES = ['openid', 'email', 'profile'];

function redirectUri() {
  return `${config.baseUrl.replace(/\/+$/, '')}/v1/auth/google/callback`;
}

function client() {
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new AppError(503, 'Google sign-in is not configured', 'google_unavailable');
  }
  return new OAuth2Client(config.googleClientId, config.googleClientSecret);
}

export function googleAuthorizationUrl() {
  return client().generateAuthUrl({
    access_type: 'offline',
    prompt: 'select_account',
    scope: SCOPES,
    redirect_uri: redirectUri(),
  });
}

export async function completeGoogleSignIn(code: string, context: SessionContext) {
  const oauth = client();
  let idToken: string | null | undefined;
  try {
    const { tokens } = await oauth.getToken({ code, redirect_uri: redirectUri() });
    idToken = tokens.id_token;
  } catch {
    throw new AppError(400, 'Google sign-in failed', 'google_auth_failed');
  }
  if (!idToken) {
    throw new AppError(400, 'Google sign-in failed', 'google_auth_failed');
  }

  let payload;
  try {
    const ticket = await oauth.verifyIdToken({ idToken, audience: config.googleClientId! });
    payload = ticket.getPayload();
  } catch {
    throw new AppError(400, 'Google sign-in failed', 'google_auth_failed');
  }

  const subject = payload?.sub;
  const email = payload?.email?.trim().toLowerCase();
  if (!subject || !email) {
    throw new AppError(400, 'Google account did not provide an email', 'google_email_missing');
  }

  const displayName =
    [payload?.given_name, payload?.family_name].filter(Boolean).join(' ').trim() ||
    payload?.name?.trim() ||
    email.split('@')[0];
  const emailVerifiedAt = payload?.email_verified ? new Date() : null;

  let account = await prisma.account.findFirst({
    where: { OR: [{ idp_subject: subject }, { email }] },
    include: { roles: true },
  });

  if (!account) {
    account = await prisma.$transaction(async (tx) => {
      const created = await tx.account.create({
        data: {
          email,
          password_hash: '',
          display_name: displayName,
          idp_subject: subject,
          email_verified_at: emailVerifiedAt,
        },
      });
      await tx.accountRole.create({ data: { account_id: created.id, role: 'PATIENT' } });
      await tx.patientProfile.create({ data: { account_id: created.id } });
      return tx.account.findUniqueOrThrow({
        where: { id: created.id },
        include: { roles: true },
      });
    });
  } else {
    account = await prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: account!.id },
        data: {
          idp_subject: account!.idp_subject ?? subject,
          email_verified_at: emailVerifiedAt ?? account!.email_verified_at,
          display_name: account!.display_name || displayName,
        },
      });
      await tx.accountRole.upsert({
        where: { account_id_role: { account_id: account!.id, role: 'PATIENT' } },
        update: {},
        create: { account_id: account!.id, role: 'PATIENT' },
      });
      await tx.patientProfile.upsert({
        where: { account_id: account!.id },
        update: {},
        create: { account_id: account!.id },
      });
      return tx.account.findUniqueOrThrow({
        where: { id: account!.id },
        include: { roles: true },
      });
    });
  }

  if (account.status !== 'ACTIVE') {
    throw new AppError(403, 'Account is not active', 'account_inactive');
  }

  const tokens = await issueSession(
    account.id,
    account.roles.map((role) => role.role),
    context,
  );
  const fragment = new URLSearchParams({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  return `${config.frontendUrl.replace(/\/+$/, '')}/auth/callback#${fragment.toString()}`;
}
