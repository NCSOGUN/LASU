export const actionLabels: Record<string, string> = {
  grant_create: "Access code created",
  grant_revoke: "Access code revoked",
  grant_open: "Access code opened",
  grant_read: "Shared record read",
  patient_code_rotate: "Patient code rotated",
  channel_consent_put: "Channel consent saved",
  channel_consent_revoke: "Channel consent revoked",
  emergency_fields_update: "Emergency fields updated",
  profile_update: "Profile updated",
  phone_verify: "Phone verified",
};

export function actionLabel(action: string): string {
  const known = actionLabels[action];
  if (known) return known;
  const words = action.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Access event";
}

export function channelLabel(channel: string): string {
  switch (channel.toUpperCase()) {
    case "WEB":
      return "Web";
    case "WEB_PRACTITIONER":
      return "Verified practitioner portal";
    case "USSD":
      return "USSD";
    case "SMS":
      return "SMS";
    default:
      return humaniseKey(channel);
  }
}

export function grantStatusLabel(status: "active" | "expired" | "revoked"): string {
  switch (status) {
    case "active":
      return "Active";
    case "expired":
      return "Expired";
    case "revoked":
      return "Revoked";
  }
}

export function grantStatusTone(status: "active" | "expired" | "revoked"): "success" | "neutral" | "danger" {
  switch (status) {
    case "active":
      return "success";
    case "expired":
      return "neutral";
    case "revoked":
      return "danger";
  }
}

export function outcomeLabel(outcome: string): string {
  switch (outcome.toUpperCase()) {
    case "ALLOWED":
      return "Allowed";
    case "DENIED":
      return "Denied";
    default:
      return humaniseKey(outcome);
  }
}

export function outcomeTone(outcome: string): "success" | "danger" | "neutral" {
  switch (outcome.toUpperCase()) {
    case "ALLOWED":
      return "success";
    case "DENIED":
      return "danger";
    default:
      return "neutral";
  }
}

export function humaniseKey(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

/** Local calendar date and time, with a fixed locale so server and client markup agree once the zone is known. */
export function formatLocalDateTime(iso: string, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}
