import { prismaFor } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { createCrypto } from '../src/security/crypto.js';

// Clearly fictional fixtures for sandbox testing. Never use as production data.
const areaId = '20000000-0000-4000-8000-000000000001';
const hospitalId = '20000000-0000-4000-8000-000000000002';
const childClinicId = '20000000-0000-4000-8000-000000000003';
const patientAccountId = '20000000-0000-4000-8000-000000000004';
const patientId = '20000000-0000-4000-8000-000000000005';
const demoPatientCode = '123456789012';

const config = loadConfig();
const crypto = createCrypto(config);
const prisma = prismaFor(config.databaseUrl);

try {
  for (const [field_key, label, value_type, sort_order] of [
    ['full_name', 'Name', 'STRING', 10],
    ['date_of_birth', 'Date of birth', 'STRING', 20],
    ['allergies', 'Allergies', 'STRING_ARRAY', 30],
    ['current_medications', 'Medications', 'STRING_ARRAY', 40],
    ['conditions', 'Conditions', 'STRING_ARRAY', 50],
    ['blood_group', 'Blood group', 'STRING', 60],
    ['emergency_contact_name', 'Contact name', 'STRING', 70],
    ['emergency_contact_phone', 'Contact phone', 'STRING', 80],
  ] as const) {
    await prisma.fieldDefinition.upsert({
      where: { field_key },
      update: { label, value_type, emergency_eligible: true, sort_order, active: true },
      create: {
        field_key,
        label,
        value_schema: { type: value_type === 'STRING_ARRAY' ? 'array' : 'string' },
        value_type,
        emergency_eligible: true,
        sort_order,
      },
    });
  }
  for (const [service_code, label, description, sort_order] of [
    ['general', 'General care', 'General outpatient and primary care', 10],
    ['pediatrics', 'Child health', 'Child and paediatric care', 20],
    ['maternity', 'Maternity care', 'Pregnancy and maternity care', 30],
  ] as const) {
    await prisma.service.upsert({
      where: { service_code },
      update: { label, description, sort_order, active: true },
      create: { service_code, label, description, sort_order },
    });
  }

  await prisma.area.upsert({
    where: { id: areaId },
    update: { name: 'Ikeja demo area', is_demo: true, active: true },
    create: {
      id: areaId,
      country_code: 'NG',
      region: 'Lagos',
      city: 'Ikeja',
      name: 'Ikeja demo area',
      center_latitude: 6.6018,
      center_longitude: 3.3515,
      is_demo: true,
      active: true,
    },
  });
  for (const facility of [
    {
      id: hospitalId,
      name: 'Demo Community Hospital',
      address: '12 Example Road, Ikeja',
    },
    {
      id: childClinicId,
      name: 'Demo Child Health Clinic',
      address: '8 Sample Street, Ikeja',
    },
  ]) {
    await prisma.facility.upsert({
      where: { id: facility.id },
      update: { ...facility, status: 'APPROVED', is_demo: true, area_id: areaId },
      create: {
        ...facility,
        area_id: areaId,
        latitude: 6.602,
        longitude: 3.352,
        status: 'APPROVED',
        is_demo: true,
      },
    });
  }
  for (const [facility_id, service_code] of [
    [hospitalId, 'general'],
    [childClinicId, 'pediatrics'],
  ] as const) {
    await prisma.facilityService.upsert({
      where: { facility_id_service_code: { facility_id, service_code } },
      update: { verification_status: 'APPROVED', verified_at: new Date() },
      create: {
        facility_id,
        service_code,
        verification_status: 'APPROVED',
        verified_at: new Date(),
      },
    });
  }

  await prisma.account.upsert({
    where: { id: patientAccountId },
    update: { display_name: 'Demo Patient', status: 'ACTIVE' },
    create: {
      id: patientAccountId,
      email: 'demo.patient@example.test',
      password_hash: 'demo-not-a-login',
      display_name: 'Demo Patient',
      status: 'ACTIVE',
    },
  });
  await prisma.accountRole.upsert({
    where: { account_id_role: { account_id: patientAccountId, role: 'PATIENT' } },
    update: {},
    create: { account_id: patientAccountId, role: 'PATIENT' },
  });
  await prisma.patientProfile.upsert({
    where: { id: patientId },
    update: {},
    create: { id: patientId, account_id: patientAccountId, preferred_language: 'en' },
  });
  const codeDigest = crypto.digestCode(demoPatientCode);
  if (!codeDigest) throw new Error('Invalid demo patient code');
  await prisma.patientCode.upsert({
    where: { patient_id: patientId },
    update: {
      code_digest: codeDigest,
      code_ciphertext: crypto.encrypt(demoPatientCode, 'patient-code'),
    },
    create: {
      patient_id: patientId,
      code_digest: codeDigest,
      code_ciphertext: crypto.encrypt(demoPatientCode, 'patient-code'),
      key_version: 1,
    },
  });
  for (const [field_key, value] of [
    ['full_name', 'Demo Patient'],
    ['allergies', ['Penicillin (demo)']],
    ['current_medications', ['Demo medicine']],
    ['emergency_contact_name', 'Chika (demo contact)'],
  ] as const) {
    await prisma.patientFieldValue.upsert({
      where: { patient_id_field_key: { patient_id: patientId, field_key } },
      update: { value },
      create: { patient_id: patientId, field_key, value, source: 'PATIENT' },
    });
  }
  await prisma.emergencyField.deleteMany({ where: { patient_id: patientId } });
  await prisma.emergencyField.createMany({
    data: [
      { patient_id: patientId, field_key: 'allergies', display_order: 1 },
      { patient_id: patientId, field_key: 'emergency_contact_name', display_order: 2 },
    ],
  });

  console.log({
    seeded: true,
    area: 'Ikeja demo area',
    facilities: ['Demo Community Hospital', 'Demo Child Health Clinic'],
    demoPatientCode,
    emergencyFields: ['allergies', 'emergency_contact_name'],
  });
} finally {
  await prisma.$disconnect();
}
