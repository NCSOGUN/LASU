import type { MeResponse } from "@/api/schemas";

export const meResponse: MeResponse = {
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
  ],
  "profile": {
    "id": "6b7acfa2-c66d-4c22-a0e9-11e496d12080",
    "preferred_language": "en",
    "home_area_id": null,
    "version": 1,
    "created_at": "2026-11-17T16:19:13.701Z",
    "updated_at": "2026-11-17T16:19:13.701Z"
  },
  "fields": [
    {
      "key": "date_of_birth",
      "label": "Date of birth",
      "value_type": "STRING",
      "value": "1990-05-12",
      "updated_at": "2026-11-17T16:19:13.704Z"
    }
  ],
  "field_values": {
    "date_of_birth": "1990-05-12"
  },
  "allergies": [],
  "medical_events": [],
  "avatar_url": null
};

export const meMedicalResponse: MeResponse = {
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
  ],
  "profile": {
    "id": "6b7acfa2-c66d-4c22-a0e9-11e496d12080",
    "preferred_language": "en",
    "home_area_id": null,
    "version": 1,
    "created_at": "2026-11-17T16:19:13.701Z",
    "updated_at": "2026-11-17T16:19:13.701Z"
  },
  "fields": [
    {
      "key": "blood_group",
      "label": "Blood group",
      "value_type": "STRING",
      "value": "O+",
      "updated_at": "2026-11-17T16:19:14.301Z"
    },
    {
      "key": "blood_pressure",
      "label": "Blood pressure",
      "value_type": "STRING",
      "value": "118/76",
      "updated_at": "2026-11-17T16:19:14.300Z"
    },
    {
      "key": "conditions",
      "label": "Conditions",
      "value_type": "STRING_ARRAY",
      "value": [
        "Hypertension"
      ],
      "updated_at": "2026-11-17T16:19:14.303Z"
    },
    {
      "key": "current_medications",
      "label": "Medications",
      "value_type": "STRING_ARRAY",
      "value": [
        "Amlodipine 5mg daily"
      ],
      "updated_at": "2026-11-17T16:19:14.303Z"
    },
    {
      "key": "date_of_birth",
      "label": "Date of birth",
      "value_type": "STRING",
      "value": "1990-05-12",
      "updated_at": "2026-11-17T16:19:13.704Z"
    },
    {
      "key": "emergency_contact_name",
      "label": "Contact name",
      "value_type": "STRING",
      "value": "Ngozi Okafor",
      "updated_at": "2026-11-17T16:19:14.304Z"
    },
    {
      "key": "emergency_contact_phone",
      "label": "Contact phone",
      "value_type": "STRING",
      "value": "+2348012345679",
      "updated_at": "2026-11-17T16:19:14.305Z"
    },
    {
      "key": "full_name",
      "label": "Name",
      "value_type": "STRING",
      "value": "Ada Okafor",
      "updated_at": "2026-11-17T16:19:14.280Z"
    },
    {
      "key": "gender",
      "label": "Gender",
      "value_type": "STRING",
      "value": "Female",
      "updated_at": "2026-11-17T16:19:14.299Z"
    },
    {
      "key": "genotype",
      "label": "Genotype",
      "value_type": "STRING",
      "value": "AA",
      "updated_at": "2026-11-17T16:19:14.302Z"
    },
    {
      "key": "height",
      "label": "Height",
      "value_type": "STRING",
      "value": "170",
      "updated_at": "2026-11-17T16:19:14.296Z"
    },
    {
      "key": "weight",
      "label": "Weight",
      "value_type": "STRING",
      "value": "68",
      "updated_at": "2026-11-17T16:19:14.298Z"
    }
  ],
  "field_values": {
    "blood_group": "O+",
    "blood_pressure": "118/76",
    "conditions": [
      "Hypertension"
    ],
    "current_medications": [
      "Amlodipine 5mg daily"
    ],
    "date_of_birth": "1990-05-12",
    "emergency_contact_name": "Ngozi Okafor",
    "emergency_contact_phone": "+2348012345679",
    "full_name": "Ada Okafor",
    "gender": "Female",
    "genotype": "AA",
    "height": "170",
    "weight": "68"
  },
  "allergies": [
    {
      "id": "38e93aa3-a734-4745-98a4-ac35eed0d6eb",
      "name": "Penicillin",
      "severity": "SEVERE",
      "diagnosis_date": "2015-06-01T00:00:00.000Z",
      "created_at": "2026-11-17T16:19:14.306Z",
      "updated_at": "2026-11-17T16:19:14.306Z"
    },
    {
      "id": "b8f89fbe-42c0-4019-866b-52b24d174e48",
      "name": "Peanuts",
      "severity": "MILD",
      "diagnosis_date": null,
      "created_at": "2026-11-17T16:19:14.306Z",
      "updated_at": "2026-11-17T16:19:14.306Z"
    }
  ],
  "medical_events": [
    {
      "id": "f65c5648-6f40-4307-bd06-21e4a8174137",
      "name": "Appendectomy",
      "recovery_time": "2 weeks",
      "occurred_on": "2019-03-14T00:00:00.000Z",
      "description": "Laparoscopic appendectomy, no complications.",
      "created_at": "2026-11-17T16:19:14.308Z",
      "updated_at": "2026-11-17T16:19:14.308Z"
    },
    {
      "id": "3009a37c-753d-4251-8ab6-e4eacbce35f5",
      "name": "Malaria",
      "recovery_time": "5 days",
      "occurred_on": "2022-08-02T00:00:00.000Z",
      "description": "Treated with artemether-lumefantrine.",
      "created_at": "2026-11-17T16:19:14.308Z",
      "updated_at": "2026-11-17T16:19:14.308Z"
    }
  ],
  "avatar_url": null
};

export const medicalEventUpdated = {
  "event": {
    "id": "f65c5648-6f40-4307-bd06-21e4a8174137",
    "patient_id": "6b7acfa2-c66d-4c22-a0e9-11e496d12080",
    "name": "Appendectomy (updated)",
    "recovery_time": "3 weeks",
    "occurred_on": "2019-03-14T00:00:00.000Z",
    "description": "Laparoscopic appendectomy; extended recovery recorded during capture.",
    "created_at": "2026-11-17T16:19:14.308Z",
    "updated_at": "2026-11-17T16:19:14.341Z"
  }
};

export const meWithoutMedicalHistory: MeResponse = {
  ...meMedicalResponse,
  "allergies": [],
  "medical_events": []
};

export const avatarUnavailable = {
  "error": "storage_unavailable",
  "message": "File storage is not configured",
  "request_id": "234280c0-1b4e-42b1-9802-c978d7f7d132"
};

export const avatarUploaded = {
  "avatar_key": "avatars/20000000-0000-4000-8000-000000000004.webp",
  "avatar_url": "https://storage.example.test/avatars/20000000-0000-4000-8000-000000000004.webp"
};
