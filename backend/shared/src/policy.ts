import type { ConsentScope, GrantScope } from './types.js';

export function isGrantLive(grant: GrantScope, channel: string, now = new Date()) {
  return (
    grant.revoked_at === null &&
    grant.expires_at.getTime() > now.getTime() &&
    grant.channels.includes(channel) &&
    grant.fields.length > 0
  );
}

export function isConsentLive(consent: ConsentScope, channel: string, now = new Date()) {
  return (
    consent.revoked_at === null &&
    consent.expires_at.getTime() > now.getTime() &&
    consent.channel === channel &&
    consent.fields.length > 0
  );
}

export function permittedFields(scopeFields: string[], requested: string[]) {
  const allowed = new Set(scopeFields);
  return Array.from(new Set(requested.filter((key) => allowed.has(key))));
}

export function hasEveryField(scopeFields: string[], required: string[]) {
  const allowed = new Set(scopeFields);
  return required.every((key) => allowed.has(key));
}
