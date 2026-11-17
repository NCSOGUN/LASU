import type { EmergencyFieldsResponse, FieldsResponse } from "@/api/schemas";

export const fieldsResponse: FieldsResponse = {
  "version": 2,
  "fields": [
    {
      "key": "full_name",
      "label": "Name",
      "value_type": "STRING",
      "emergency_eligible": true,
      "sort_order": 10,
      "value": "Bola Adeyemi",
      "field_version": 1
    },
    {
      "key": "date_of_birth",
      "label": "Date of birth",
      "value_type": "STRING",
      "emergency_eligible": true,
      "sort_order": 20,
      "value": "1994-11-03",
      "field_version": 2
    },
    {
      "key": "allergies",
      "label": "Allergies",
      "value_type": "STRING_ARRAY",
      "emergency_eligible": true,
      "sort_order": 30,
      "value": [
        "Penicillin"
      ],
      "field_version": 1
    },
    {
      "key": "current_medications",
      "label": "Medications",
      "value_type": "STRING_ARRAY",
      "emergency_eligible": true,
      "sort_order": 40,
      "value": [
        "Paracetamol as needed"
      ],
      "field_version": 1
    },
    {
      "key": "conditions",
      "label": "Conditions",
      "value_type": "STRING_ARRAY",
      "emergency_eligible": true,
      "sort_order": 50,
      "value": [
        "Asthma"
      ],
      "field_version": 1
    },
    {
      "key": "blood_group",
      "label": "Blood group",
      "value_type": "STRING",
      "emergency_eligible": true,
      "sort_order": 60,
      "value": "O+",
      "field_version": 1
    },
    {
      "key": "emergency_contact_name",
      "label": "Contact name",
      "value_type": "STRING",
      "emergency_eligible": true,
      "sort_order": 70,
      "value": "Tunde Adeyemi",
      "field_version": 1
    },
    {
      "key": "emergency_contact_phone",
      "label": "Contact phone",
      "value_type": "STRING",
      "emergency_eligible": true,
      "sort_order": 80,
      "value": "+2348098765433",
      "field_version": 1
    },
    {
      "key": "weight",
      "label": "Weight",
      "value_type": "STRING",
      "emergency_eligible": false,
      "sort_order": 90,
      "value": "64",
      "field_version": 1
    },
    {
      "key": "height",
      "label": "Height",
      "value_type": "STRING",
      "emergency_eligible": false,
      "sort_order": 100,
      "value": "168",
      "field_version": 1
    },
    {
      "key": "gender",
      "label": "Gender",
      "value_type": "STRING",
      "emergency_eligible": false,
      "sort_order": 110,
      "value": "Female",
      "field_version": 1
    },
    {
      "key": "blood_pressure",
      "label": "Blood pressure",
      "value_type": "STRING",
      "emergency_eligible": false,
      "sort_order": 120,
      "value": null,
      "field_version": null
    },
    {
      "key": "genotype",
      "label": "Genotype",
      "value_type": "STRING",
      "emergency_eligible": false,
      "sort_order": 130,
      "value": null,
      "field_version": null
    },
    {
      "key": "existing_conditions",
      "label": "Existing conditions",
      "value_type": "STRING_ARRAY",
      "emergency_eligible": false,
      "sort_order": 140,
      "value": null,
      "field_version": null
    },
    {
      "key": "existing_medications",
      "label": "Existing medications",
      "value_type": "STRING_ARRAY",
      "emergency_eligible": false,
      "sort_order": 150,
      "value": null,
      "field_version": null
    }
  ]
};

export const emergencyFieldsResponse: EmergencyFieldsResponse = {
  "version": 3,
  "field_keys": [
    "full_name",
    "allergies",
    "current_medications",
    "blood_group",
    "emergency_contact_name"
  ]
};

export const fieldsEmpty = {
  "version": 1,
  "fields": []
};

export const fieldsConflict = {
  "error": "version_conflict",
  "message": "The record changed since it was loaded",
  "request_id": "7dd3ba7b-61d5-4a64-a70c-3d2b21e7c4e2"
};

export const emergencySummaryEmpty = {
  "available": false,
  "version": 2,
  "field_keys": [],
  "fields": []
};

export const emergencyFieldsCleared = {
  "version": 4,
  "field_keys": []
};
