import type { Session } from "@/api/schemas";

export const demoAccount = {
  "id": "20000000-0000-4000-8000-000000000004",
  "email": "demo.patient@example.test",
  "display_name": "Demo Patient",
  "status": "ACTIVE",
  "idp_subject": null,
  "avatar_key": null,
  "email_verified_at": null,
  "phone_verified_at": null,
  "created_at": "2026-11-17T15:43:52.132Z",
  "updated_at": "2026-11-17T16:02:02.106Z"
};

export const demoSession: Session = {
  "account": {
    "id": "20000000-0000-4000-8000-000000000004",
    "email": "demo.patient@example.test",
    "display_name": "Demo Patient",
    "status": "ACTIVE",
    "idp_subject": null,
    "avatar_key": null,
    "email_verified_at": null,
    "phone_verified_at": null,
    "created_at": "2026-11-17T15:43:52.132Z",
    "updated_at": "2026-11-17T16:02:02.106Z"
  },
  "roles": [
    "PATIENT"
  ]
};

export const registerSession: Session = {
  "account": {
    "id": "d2e6b647-3603-4b55-80e7-cf6c67f5816b",
    "email": "ada.okafor@example.test",
    "display_name": "Ada Okafor",
    "status": "ACTIVE",
    "idp_subject": null,
    "avatar_key": null,
    "email_verified_at": null,
    "phone_verified_at": null,
    "created_at": "2026-11-17T16:19:13.699Z",
    "updated_at": "2026-11-17T16:19:13.699Z"
  },
  "roles": [
    "PATIENT"
  ]
};

export const phoneBegin = {
  "status": "sent",
  "expires_in": 600
};

export const phoneConfirm = {
  "verified": true,
  "phone_verified_at": "2026-11-17T16:19:14.390Z"
};
