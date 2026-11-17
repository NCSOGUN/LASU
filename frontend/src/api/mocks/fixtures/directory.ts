export const services = [
  {
    "service_code": "general",
    "label": "General care",
    "description": "General outpatient and primary care"
  },
  {
    "service_code": "pediatrics",
    "label": "Child health",
    "description": "Child and paediatric care"
  },
  {
    "service_code": "maternity",
    "label": "Maternity care",
    "description": "Pregnancy and maternity care"
  }
];

export const areas = [
  {
    "id": "20000000-0000-4000-8000-000000000001",
    "name": "Ikeja demo area",
    "region": "Lagos",
    "city": "Ikeja",
    "is_demo": true
  }
];

export const facilities = [
  {
    "id": "20000000-0000-4000-8000-000000000002",
    "name": "Demo Community Hospital",
    "address": "12 Example Road, Ikeja",
    "phone": null,
    "distance_km": 0.385,
    "is_demo": true,
    "service_code": "general"
  },
  {
    "id": "20000000-0000-4000-8000-000000000003",
    "name": "Demo Child Health Clinic",
    "address": "8 Sample Street, Ikeja",
    "phone": null,
    "distance_km": 0.547,
    "is_demo": true,
    "service_code": "general"
  }
];

export const facilityDetail = {
  "id": "20000000-0000-4000-8000-000000000002",
  "name": "Demo Community Hospital",
  "address": "12 Example Road, Ikeja",
  "area_id": "20000000-0000-4000-8000-000000000001",
  "area": {
    "id": "20000000-0000-4000-8000-000000000001",
    "name": "Ikeja demo area",
    "region": "Lagos",
    "city": "Ikeja"
  },
  "latitude": 6.6041,
  "longitude": 3.3489,
  "phone": null,
  "last_verified_at": "2026-11-17T15:43:56.515Z",
  "verified_at": "2026-11-17T15:43:56.515Z",
  "is_demo": true,
  "source_trust": "unknown",
  "services": [
    {
      "service_code": "general",
      "label": "General care",
      "availability_note": null
    },
    {
      "service_code": "pediatrics",
      "label": "Child health",
      "availability_note": null
    }
  ]
};
