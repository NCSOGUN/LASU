export const consent = {
  "available": true,
  "consent_id": "19d688bc-8a55-4104-808c-e6a624254512",
  "channel": "SMS",
  "phone_link_id": "d78eee1c-b9ec-4867-896e-d69cfcd1a1d1",
  "expires_at": "2026-11-18T16:19:14.710Z",
  "version": 1,
  "field_keys": [
    "full_name",
    "allergies"
  ]
};

export const consentUssd = {
  "available": true,
  "consent_id": "5f3e0d9a-4d33-4f7c-8d1b-2a6e9c0b7f14",
  "channel": "USSD",
  "phone_link_id": "d78eee1c-b9ec-4867-896e-d69cfcd1a1d1",
  "expires_at": "2026-11-18T16:19:14.710Z",
  "version": 1,
  "field_keys": [
    "full_name"
  ]
};

export const consentRevoked = {
  "available": true,
  "revoked": true
};

export const invalidCodeError = {
  "error": "invalid_code",
  "message": "Invalid or expired verification code",
  "request_id": "22d9449b-5ca4-4e4e-802b-cd61d64aaf0a"
};

export const channelLinkRequiredError = {
  "error": "channel_link_required",
  "message": "An active channel link is required for this consent",
  "request_id": "063d12a5-d0c2-43e2-b3db-85ae23f8cff1"
};
