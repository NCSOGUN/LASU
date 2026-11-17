export const scheduleCreate = {
  "schedule": {
    "id": "ff5c2b3f-81ea-4038-9b93-adce5efcdf46",
    "patient_id": "20000000-0000-4000-8000-000000000005",
    "title": "Headache relief plan",
    "description": "Short course for tension headache",
    "medications": [
      {
        "dose": "500 mg",
        "drug": "Paracetamol",
        "times": [
          {
            "hour": 8,
            "minute": 0
          },
          {
            "hour": 14,
            "minute": 0
          },
          {
            "hour": 20,
            "minute": 0
          }
        ],
        "frequency": "Three times daily"
      }
    ],
    "start_date": "2026-11-17T00:00:00.000Z",
    "end_date": "2026-11-19T00:00:00.000Z",
    "summary": "Paracetamol 500 mg up to three times daily for two days",
    "progress": "0",
    "score": "100",
    "created_at": "2026-11-17T16:22:06.462Z",
    "updated_at": "2026-11-17T16:22:06.462Z"
  }
};

export const scheduleCreateAi = {
  "schedule": {
    "id": "6a1b5704-af72-4cce-aa11-21807dd95d0b",
    "patient_id": "20000000-0000-4000-8000-000000000005",
    "title": null,
    "description": null,
    "medications": [
      {
        "dose": "500 mg",
        "drug": "Amoxicillin",
        "times": [
          {
            "hour": 8,
            "minute": 0
          },
          {
            "hour": 14,
            "minute": 0
          },
          {
            "hour": 20,
            "minute": 0
          }
        ],
        "frequency": "Three times daily"
      }
    ],
    "start_date": "2026-11-17T00:00:00.000Z",
    "end_date": "2026-11-20T00:00:00.000Z",
    "summary": "Take amoxicillin 500 mg three times daily for four days, from November 17 through November 20, 2026.",
    "progress": "0",
    "score": "100",
    "created_at": "2026-11-17T16:22:27.700Z",
    "updated_at": "2026-11-17T16:22:27.700Z"
  }
};

export const scheduleList = {
  "schedules": [
    {
      "id": "ff5c2b3f-81ea-4038-9b93-adce5efcdf46",
      "patient_id": "20000000-0000-4000-8000-000000000005",
      "title": "Headache relief plan",
      "description": "Short course for tension headache",
      "medications": [
        {
          "dose": "500 mg",
          "drug": "Paracetamol",
          "times": [
            {
              "hour": 8,
              "minute": 0
            },
            {
              "hour": 14,
              "minute": 0
            },
            {
              "hour": 20,
              "minute": 0
            }
          ],
          "frequency": "Three times daily"
        }
      ],
      "start_date": "2026-11-17T00:00:00.000Z",
      "end_date": "2026-11-19T00:00:00.000Z",
      "summary": "Paracetamol 500 mg up to three times daily for two days",
      "progress": "0",
      "score": "100",
      "created_at": "2026-11-17T16:22:06.462Z",
      "updated_at": "2026-11-17T16:22:06.462Z"
    }
  ],
  "page": 1,
  "limit": 10,
  "total": 1,
  "totalPages": 1
};

export const scheduleDetail = {
  "schedule": {
    "id": "ff5c2b3f-81ea-4038-9b93-adce5efcdf46",
    "patient_id": "20000000-0000-4000-8000-000000000005",
    "title": "Headache relief plan",
    "description": "Short course for tension headache",
    "medications": [
      {
        "dose": "500 mg",
        "drug": "Paracetamol",
        "times": [
          {
            "hour": 8,
            "minute": 0
          },
          {
            "hour": 14,
            "minute": 0
          },
          {
            "hour": 20,
            "minute": 0
          }
        ],
        "frequency": "Three times daily"
      }
    ],
    "start_date": "2026-11-17T00:00:00.000Z",
    "end_date": "2026-11-19T00:00:00.000Z",
    "summary": "Paracetamol 500 mg up to three times daily for two days",
    "progress": "0",
    "score": "100",
    "created_at": "2026-11-17T16:22:06.462Z",
    "updated_at": "2026-11-17T16:22:06.462Z",
    "moments": [
      {
        "id": "04f6d070-d980-4326-a9b0-5ce7e0b79585",
        "medication_schedule_id": "ff5c2b3f-81ea-4038-9b93-adce5efcdf46",
        "drug": "Paracetamol",
        "dose": "500 mg",
        "frequency": "Three times daily",
        "status": "PENDING",
        "time": "2026-11-17T07:00:00.000Z",
        "notified_user": false,
        "notified_at": null,
        "created_at": "2026-11-17T16:22:06.464Z"
      },
      {
        "id": "ae10333d-b68b-4c18-aec6-0bc6ccf5c702",
        "medication_schedule_id": "ff5c2b3f-81ea-4038-9b93-adce5efcdf46",
        "drug": "Paracetamol",
        "dose": "500 mg",
        "frequency": "Three times daily",
        "status": "PENDING",
        "time": "2026-11-17T13:00:00.000Z",
        "notified_user": false,
        "notified_at": null,
        "created_at": "2026-11-17T16:22:06.464Z"
      },
      {
        "id": "3207275c-e34f-4372-a4ee-7f9ab94b06d1",
        "medication_schedule_id": "ff5c2b3f-81ea-4038-9b93-adce5efcdf46",
        "drug": "Paracetamol",
        "dose": "500 mg",
        "frequency": "Three times daily",
        "status": "PENDING",
        "time": "2026-11-17T19:00:00.000Z",
        "notified_user": false,
        "notified_at": null,
        "created_at": "2026-11-17T16:22:06.464Z"
      },
      {
        "id": "0c68fada-0401-45ee-a3fe-aadf2d00beaa",
        "medication_schedule_id": "ff5c2b3f-81ea-4038-9b93-adce5efcdf46",
        "drug": "Paracetamol",
        "dose": "500 mg",
        "frequency": "Three times daily",
        "status": "PENDING",
        "time": "2026-11-18T07:00:00.000Z",
        "notified_user": false,
        "notified_at": null,
        "created_at": "2026-11-17T16:22:06.464Z"
      },
      {
        "id": "a65667fe-aa3a-495e-aa53-8eba711b2ec3",
        "medication_schedule_id": "ff5c2b3f-81ea-4038-9b93-adce5efcdf46",
        "drug": "Paracetamol",
        "dose": "500 mg",
        "frequency": "Three times daily",
        "status": "PENDING",
        "time": "2026-11-18T13:00:00.000Z",
        "notified_user": false,
        "notified_at": null,
        "created_at": "2026-11-17T16:22:06.464Z"
      },
      {
        "id": "0ec0fffd-8cb9-40bc-8fbc-fb8962f05b27",
        "medication_schedule_id": "ff5c2b3f-81ea-4038-9b93-adce5efcdf46",
        "drug": "Paracetamol",
        "dose": "500 mg",
        "frequency": "Three times daily",
        "status": "PENDING",
        "time": "2026-11-18T19:00:00.000Z",
        "notified_user": false,
        "notified_at": null,
        "created_at": "2026-11-17T16:22:06.464Z"
      },
      {
        "id": "382c8be3-f60a-49e1-aed8-d8aa2a9deb93",
        "medication_schedule_id": "ff5c2b3f-81ea-4038-9b93-adce5efcdf46",
        "drug": "Paracetamol",
        "dose": "500 mg",
        "frequency": "Three times daily",
        "status": "PENDING",
        "time": "2026-11-19T07:00:00.000Z",
        "notified_user": false,
        "notified_at": null,
        "created_at": "2026-11-17T16:22:06.464Z"
      },
      {
        "id": "04c00d85-d108-4f31-91db-498aa00dd781",
        "medication_schedule_id": "ff5c2b3f-81ea-4038-9b93-adce5efcdf46",
        "drug": "Paracetamol",
        "dose": "500 mg",
        "frequency": "Three times daily",
        "status": "PENDING",
        "time": "2026-11-19T13:00:00.000Z",
        "notified_user": false,
        "notified_at": null,
        "created_at": "2026-11-17T16:22:06.464Z"
      },
      {
        "id": "12f31a0c-0657-45d7-aa1d-1200741b1b9a",
        "medication_schedule_id": "ff5c2b3f-81ea-4038-9b93-adce5efcdf46",
        "drug": "Paracetamol",
        "dose": "500 mg",
        "frequency": "Three times daily",
        "status": "PENDING",
        "time": "2026-11-19T19:00:00.000Z",
        "notified_user": false,
        "notified_at": null,
        "created_at": "2026-11-17T16:22:06.464Z"
      }
    ]
  }
};

export const momentUpdate = {
  "moment": {
    "id": "04f6d070-d980-4326-a9b0-5ce7e0b79585",
    "medication_schedule_id": "ff5c2b3f-81ea-4038-9b93-adce5efcdf46",
    "drug": "Paracetamol",
    "dose": "500 mg",
    "frequency": "Three times daily",
    "status": "TAKEN",
    "time": "2026-11-17T07:00:00.000Z",
    "notified_user": false,
    "notified_at": null,
    "created_at": "2026-11-17T16:22:06.464Z"
  },
  "progress": "100",
  "score": "100"
};

export const scheduleAdd = {
  "schedule": {
    "id": "ff5c2b3f-81ea-4038-9b93-adce5efcdf46",
    "patient_id": "20000000-0000-4000-8000-000000000005",
    "title": "Headache relief plan",
    "description": "Short course for tension headache",
    "medications": [
      {
        "dose": "500 mg",
        "drug": "Paracetamol",
        "times": [
          {
            "hour": 8,
            "minute": 0
          },
          {
            "hour": 14,
            "minute": 0
          },
          {
            "hour": 20,
            "minute": 0
          }
        ],
        "frequency": "Three times daily"
      },
      {
        "dose": "200 mg",
        "drug": "Ibuprofen",
        "times": [
          {
            "hour": 9,
            "minute": 30
          },
          {
            "hour": 21,
            "minute": 30
          }
        ],
        "frequency": "Twice daily"
      }
    ],
    "start_date": "2026-11-17T00:00:00.000Z",
    "end_date": "2026-11-19T00:00:00.000Z",
    "summary": "Paracetamol 500 mg up to three times daily for two days",
    "progress": "100",
    "score": "100",
    "created_at": "2026-11-17T16:22:06.462Z",
    "updated_at": "2026-11-17T16:22:16.184Z"
  }
};

export const scheduleRemove = {
  "schedule": {
    "id": "ff5c2b3f-81ea-4038-9b93-adce5efcdf46",
    "patient_id": "20000000-0000-4000-8000-000000000005",
    "title": "Headache relief plan",
    "description": "Short course for tension headache",
    "medications": [
      {
        "dose": "500 mg",
        "drug": "Paracetamol",
        "times": [
          {
            "hour": 8,
            "minute": 0
          },
          {
            "hour": 14,
            "minute": 0
          },
          {
            "hour": 20,
            "minute": 0
          }
        ],
        "frequency": "Three times daily"
      }
    ],
    "start_date": "2026-11-17T00:00:00.000Z",
    "end_date": "2026-11-19T00:00:00.000Z",
    "summary": "Paracetamol 500 mg up to three times daily for two days",
    "progress": "100",
    "score": "100",
    "created_at": "2026-11-17T16:22:06.462Z",
    "updated_at": "2026-11-17T16:22:16.202Z"
  }
};

export const scheduleDelete = {
  "message": "Medication schedule deleted"
};

export const deviceRegistered = {
  "device": {
    "id": "85d0c92f-7e2b-4e27-8efd-289f5f6de2ea",
    "platform": "WEB"
  }
};
