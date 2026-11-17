export const emergencySummary = {
  "available": true,
  "version": 3,
  "field_keys": [
    "full_name",
    "allergies",
    "current_medications",
    "blood_group",
    "emergency_contact_name"
  ],
  "fields": [
    {
      "key": "full_name",
      "label": "Name",
      "value": "Bola Adeyemi"
    },
    {
      "key": "allergies",
      "label": "Allergies",
      "value": [
        "Penicillin"
      ]
    },
    {
      "key": "current_medications",
      "label": "Medications",
      "value": [
        "Paracetamol as needed"
      ]
    },
    {
      "key": "blood_group",
      "label": "Blood group",
      "value": "O+"
    },
    {
      "key": "emergency_contact_name",
      "label": "Contact name",
      "value": "Tunde Adeyemi"
    }
  ]
};

export const patientCode = {
  "available": true,
  "code": "123456789012",
  "code_version": 1,
  "rotated_at": "2026-11-17T16:19:14.675Z"
};

export const patientCodeRotated = {
  "available": true,
  "code": "987654321098",
  "code_version": 2,
  "rotated_at": "2026-11-17T16:19:14.682Z"
};

export const grants = [
  {
    "id": "e8688af7-ccef-4b28-9776-df8ed14a812f",
    "grant_id": "e8688af7-ccef-4b28-9776-df8ed14a812f",
    "status": "revoked",
    "expires_at": "2026-11-17T16:34:15.179Z",
    "revoked_at": "2026-11-17T16:19:15.189Z",
    "created_at": "2026-11-17T16:19:15.180Z",
    "field_keys": [
      "full_name"
    ],
    "channels": [
      "USSD",
      "WEB_PRACTITIONER"
    ]
  },
  {
    "id": "a9234d39-2af2-4d99-a964-9a6565fae4f7",
    "grant_id": "a9234d39-2af2-4d99-a964-9a6565fae4f7",
    "status": "active",
    "expires_at": "2026-11-17T16:49:14.735Z",
    "revoked_at": null,
    "created_at": "2026-11-17T16:19:14.736Z",
    "field_keys": [
      "allergies",
      "blood_group",
      "current_medications",
      "full_name"
    ],
    "channels": [
      "WEB_PRACTITIONER"
    ]
  }
];

export const grantCreated = {
  "available": true,
  "id": "a9234d39-2af2-4d99-a964-9a6565fae4f7",
  "grant_id": "a9234d39-2af2-4d99-a964-9a6565fae4f7",
  "code": "48219367",
  "expires_at": "2026-11-17T16:49:14.735Z",
  "created_at": "2026-11-17T16:19:14.736Z",
  "field_keys": [
    "full_name",
    "allergies",
    "current_medications",
    "blood_group"
  ],
  "channels": [
    "WEB_PRACTITIONER"
  ]
};

export const grantRevoked = {
  "available": true,
  "revoked": true,
  "id": "e8688af7-ccef-4b28-9776-df8ed14a812f"
};

export const accessEvents = [
  {
    "id": "417",
    "occurred_at": "2026-11-17T16:19:15.193Z",
    "channel": "WEB",
    "action": "grant_revoke",
    "outcome": "ALLOWED",
    "reason_code": null,
    "resource_type": "access_grant",
    "resource_id": "e8688af7-ccef-4b28-9776-df8ed14a812f",
    "field_keys": []
  },
  {
    "id": "416",
    "occurred_at": "2026-11-17T16:19:15.184Z",
    "channel": "WEB",
    "action": "grant_create",
    "outcome": "ALLOWED",
    "reason_code": null,
    "resource_type": "access_grant",
    "resource_id": "e8688af7-ccef-4b28-9776-df8ed14a812f",
    "field_keys": [
      "full_name"
    ]
  },
  {
    "id": "415",
    "occurred_at": "2026-11-17T16:19:15.161Z",
    "channel": "WEB",
    "action": "grant_read",
    "outcome": "ALLOWED",
    "reason_code": null,
    "resource_type": "access_grant",
    "resource_id": "a9234d39-2af2-4d99-a964-9a6565fae4f7",
    "field_keys": [
      "full_name",
      "allergies",
      "current_medications",
      "blood_group"
    ]
  },
  {
    "id": "414",
    "occurred_at": "2026-11-17T16:19:15.149Z",
    "channel": "WEB",
    "action": "grant_open",
    "outcome": "ALLOWED",
    "reason_code": null,
    "resource_type": "access_grant",
    "resource_id": "a9234d39-2af2-4d99-a964-9a6565fae4f7",
    "field_keys": [
      "full_name",
      "allergies",
      "current_medications",
      "blood_group"
    ]
  },
  {
    "id": "411",
    "occurred_at": "2026-11-17T16:19:14.742Z",
    "channel": "WEB",
    "action": "grant_create",
    "outcome": "ALLOWED",
    "reason_code": null,
    "resource_type": "access_grant",
    "resource_id": "a9234d39-2af2-4d99-a964-9a6565fae4f7",
    "field_keys": [
      "full_name",
      "allergies",
      "current_medications",
      "blood_group"
    ]
  },
  {
    "id": "410",
    "occurred_at": "2026-11-17T16:19:14.727Z",
    "channel": "WEB",
    "action": "channel_consent_revoke",
    "outcome": "ALLOWED",
    "reason_code": null,
    "resource_type": "profile_consent",
    "resource_id": null,
    "field_keys": []
  },
  {
    "id": "409",
    "occurred_at": "2026-11-17T16:19:14.717Z",
    "channel": "WEB",
    "action": "channel_consent_put",
    "outcome": "ALLOWED",
    "reason_code": null,
    "resource_type": "profile_consent",
    "resource_id": "19d688bc-8a55-4104-808c-e6a624254512",
    "field_keys": [
      "full_name",
      "allergies"
    ]
  },
  {
    "id": "408",
    "occurred_at": "2026-11-17T16:19:14.687Z",
    "channel": "WEB",
    "action": "patient_code_rotate",
    "outcome": "ALLOWED",
    "reason_code": null,
    "resource_type": "patient_code",
    "resource_id": "fae30f4c-3dc6-47ff-b971-48c28f6b5d3d",
    "field_keys": []
  },
  {
    "id": "407",
    "occurred_at": "2026-11-17T16:19:14.658Z",
    "channel": "WEB",
    "action": "emergency_fields_update",
    "outcome": "ALLOWED",
    "reason_code": null,
    "resource_type": "patient_profile",
    "resource_id": "fae30f4c-3dc6-47ff-b971-48c28f6b5d3d",
    "field_keys": [
      "full_name",
      "allergies",
      "current_medications",
      "blood_group",
      "emergency_contact_name"
    ]
  },
  {
    "id": "406",
    "occurred_at": "2026-11-17T16:19:14.625Z",
    "channel": "WEB",
    "action": "profile_update",
    "outcome": "ALLOWED",
    "reason_code": null,
    "resource_type": "patient_profile",
    "resource_id": "fae30f4c-3dc6-47ff-b971-48c28f6b5d3d",
    "field_keys": [
      "full_name",
      "date_of_birth",
      "allergies",
      "current_medications",
      "conditions",
      "blood_group",
      "emergency_contact_name",
      "emergency_contact_phone",
      "weight",
      "height",
      "gender"
    ]
  }
];
