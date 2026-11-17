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
  },
  {
    "id": "20000000-0000-4000-8000-000000000010",
    "name": "Kano demo area",
    "region": "Kano",
    "city": "Kano",
    "is_demo": true
  },
  {
    "id": "20000000-0000-4000-8000-000000000011",
    "name": "Lekki demo area",
    "region": "Lagos",
    "city": "Lekki",
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
  },
  {
    "id": "20000000-0000-4000-8000-000000000004",
    "name": "Demo Family Health Centre",
    "address": "21 Demonstration Avenue, Ikeja",
    "phone": "+2348012345678",
    "distance_km": 0.902,
    "is_demo": true,
    "service_code": "general"
  },
  {
    "id": "20000000-0000-4000-8000-000000000005",
    "name": "Demo Maternity Clinic",
    "address": "4 Antenatal Close, Ikeja",
    "phone": null,
    "distance_km": 0.62,
    "is_demo": true,
    "service_code": "maternity"
  },
  {
    "id": "20000000-0000-4000-8000-000000000006",
    "name": "Nearby Children's Clinic",
    "address": "2 Paediatric Lane, Ikeja",
    "phone": "+2348098765432",
    "distance_km": 0.12,
    "is_demo": true,
    "service_code": "pediatrics"
  },
  {
    "id": "20000000-0000-4000-8000-000000000007",
    "name": "Demo Community Clinic",
    "address": "77 Further Road, Ikeja",
    "phone": null,
    "distance_km": 3.204,
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

export const facilityDetails = {
  "20000000-0000-4000-8000-000000000002": facilityDetail,
  "20000000-0000-4000-8000-000000000003": {
    "id": "20000000-0000-4000-8000-000000000003",
    "name": "Demo Child Health Clinic",
    "address": "8 Sample Street, Ikeja",
    "area_id": "20000000-0000-4000-8000-000000000001",
    "area": {
      "id": "20000000-0000-4000-8000-000000000001",
      "name": "Ikeja demo area",
      "region": "Lagos",
      "city": "Ikeja"
    },
    "latitude": 6.6032,
    "longitude": 3.3495,
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
      }
    ]
  },
  "20000000-0000-4000-8000-000000000004": {
    "id": "20000000-0000-4000-8000-000000000004",
    "name": "Demo Family Health Centre",
    "address": "21 Demonstration Avenue, Ikeja",
    "area_id": "20000000-0000-4000-8000-000000000001",
    "area": {
      "id": "20000000-0000-4000-8000-000000000001",
      "name": "Ikeja demo area",
      "region": "Lagos",
      "city": "Ikeja"
    },
    "latitude": 6.6011,
    "longitude": 3.3512,
    "phone": "+2348012345678",
    "last_verified_at": "2026-11-17T15:43:56.515Z",
    "verified_at": "2026-11-17T15:43:56.515Z",
    "is_demo": true,
    "source_trust": "verified",
    "services": [
      {
        "service_code": "general",
        "label": "General care",
        "availability_note": "Open on weekdays"
      },
      {
        "service_code": "maternity",
        "label": "Maternity care",
        "availability_note": null
      }
    ]
  },
  "20000000-0000-4000-8000-000000000005": {
    "id": "20000000-0000-4000-8000-000000000005",
    "name": "Demo Maternity Clinic",
    "address": "4 Antenatal Close, Ikeja",
    "area_id": "20000000-0000-4000-8000-000000000001",
    "area": {
      "id": "20000000-0000-4000-8000-000000000001",
      "name": "Ikeja demo area",
      "region": "Lagos",
      "city": "Ikeja"
    },
    "latitude": 6.605,
    "longitude": 3.3501,
    "phone": null,
    "last_verified_at": "2026-11-17T15:43:56.515Z",
    "verified_at": "2026-11-17T15:43:56.515Z",
    "is_demo": true,
    "source_trust": "unknown",
    "services": [
      {
        "service_code": "maternity",
        "label": "Maternity care",
        "availability_note": null
      }
    ]
  },
  "20000000-0000-4000-8000-000000000006": {
    "id": "20000000-0000-4000-8000-000000000006",
    "name": "Nearby Children's Clinic",
    "address": "2 Paediatric Lane, Ikeja",
    "area_id": "20000000-0000-4000-8000-000000000001",
    "area": {
      "id": "20000000-0000-4000-8000-000000000001",
      "name": "Ikeja demo area",
      "region": "Lagos",
      "city": "Ikeja"
    },
    "latitude": 6.6045,
    "longitude": 3.3488,
    "phone": "+2348098765432",
    "last_verified_at": "2026-11-17T15:43:56.515Z",
    "verified_at": "2026-11-17T15:43:56.515Z",
    "is_demo": true,
    "source_trust": "unknown",
    "services": [
      {
        "service_code": "pediatrics",
        "label": "Child health",
        "availability_note": null
      }
    ]
  },
  "20000000-0000-4000-8000-000000000007": {
    "id": "20000000-0000-4000-8000-000000000007",
    "name": "Demo Community Clinic",
    "address": "77 Further Road, Ikeja",
    "area_id": "20000000-0000-4000-8000-000000000001",
    "area": {
      "id": "20000000-0000-4000-8000-000000000001",
      "name": "Ikeja demo area",
      "region": "Lagos",
      "city": "Ikeja"
    },
    "latitude": 6.611,
    "longitude": 3.3602,
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
      }
    ]
  }
};
