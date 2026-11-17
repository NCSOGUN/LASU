import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { createCrypto } from '@healthaccess/shared';

const prisma = new PrismaClient();

const fields = [
  ['full_name', 'Name', 'STRING', true, 10],
  ['date_of_birth', 'Date of birth', 'STRING', true, 20],
  ['allergies', 'Allergies', 'STRING_ARRAY', true, 30],
  ['current_medications', 'Medications', 'STRING_ARRAY', true, 40],
  ['conditions', 'Conditions', 'STRING_ARRAY', true, 50],
  ['blood_group', 'Blood group', 'STRING', true, 60],
  ['emergency_contact_name', 'Contact name', 'STRING', true, 70],
  ['emergency_contact_phone', 'Contact phone', 'STRING', true, 80],
  ['weight', 'Weight', 'STRING', false, 90],
  ['height', 'Height', 'STRING', false, 100],
  ['gender', 'Gender', 'STRING', false, 110],
  ['blood_pressure', 'Blood pressure', 'STRING', false, 120],
  ['genotype', 'Genotype', 'STRING', false, 130],
  ['existing_conditions', 'Existing conditions', 'STRING_ARRAY', false, 140],
  ['existing_medications', 'Existing medications', 'STRING_ARRAY', false, 150],
] as const;

const services = [
  ['general', 'General care', 'General outpatient and primary care', 10],
  ['pediatrics', 'Child health', 'Child and paediatric care', 20],
  ['maternity', 'Maternity care', 'Pregnancy and maternity care', 30],
] as const;

const DEMO_AREA_ID = '20000000-0000-4000-8000-000000000001';
const DEMO_HOSPITAL_ID = '20000000-0000-4000-8000-000000000002';
const DEMO_CLINIC_ID = '20000000-0000-4000-8000-000000000003';
const DEMO_ACCOUNT_ID = '20000000-0000-4000-8000-000000000004';
const DEMO_PATIENT_ID = '20000000-0000-4000-8000-000000000005';

const DEMO_EMAIL = 'demo.patient@example.test';
const DEMO_PASSWORD = 'DemoPass123!';
const DEMO_PATIENT_CODE = '123456789012';

const demoFieldValues = [
  ['full_name', 'Demo Patient', 10],
  ['allergies', ['Penicillin'], 30],
  ['current_medications', ['Paracetamol as needed'], 40],
  ['emergency_contact_name', 'Demo Contact', 70],
  ['emergency_contact_phone', '+2348000000000', 80],
] as const;

function cryptoFromEnv() {
  const dataEncryptionKey = process.env.DATA_ENCRYPTION_KEY;
  const codeDigestKey = process.env.CODE_DIGEST_KEY;
  if (!dataEncryptionKey || !codeDigestKey) {
    throw new Error('DATA_ENCRYPTION_KEY and CODE_DIGEST_KEY are required to seed demo codes');
  }

  return createCrypto({
    dataEncryptionKey,
    codeDigestKey,
    phoneDigestKey: process.env.PHONE_DIGEST_KEY ?? codeDigestKey,
    inputFingerprintKey: process.env.INPUT_FINGERPRINT_KEY ?? dataEncryptionKey,
    encryptionKeyVersion: Number.parseInt(process.env.ENCRYPTION_KEY_VERSION ?? '1', 10) || 1,
  });
}

async function seedDirectory() {
  await prisma.area.upsert({
    where: { id: DEMO_AREA_ID },
    update: {
      country_code: 'NG',
      region: 'Lagos',
      city: 'Ikeja',
      name: 'Ikeja',
      center_latitude: '6.601800',
      center_longitude: '3.351500',
      is_demo: true,
      active: true,
    },
    create: {
      id: DEMO_AREA_ID,
      country_code: 'NG',
      region: 'Lagos',
      city: 'Ikeja',
      name: 'Ikeja',
      center_latitude: '6.601800',
      center_longitude: '3.351500',
      is_demo: true,
      active: true,
    },
  });

  const facilities = [
    {
      id: DEMO_HOSPITAL_ID,
      name: 'Demo Community Hospital',
      address: '1 Demo Road, Ikeja, Lagos',
      latitude: '6.604100',
      longitude: '3.348900',
    },
    {
      id: DEMO_CLINIC_ID,
      name: 'Demo Child Health Clinic',
      address: '2 Demo Close, Ikeja, Lagos',
      latitude: '6.599200',
      longitude: '3.355700',
    },
  ] as const;

  for (const facility of facilities) {
    await prisma.facility.upsert({
      where: { id: facility.id },
      update: {
        name: facility.name,
        address: facility.address,
        area_id: DEMO_AREA_ID,
        latitude: facility.latitude,
        longitude: facility.longitude,
        status: 'APPROVED',
        is_demo: true,
        last_verified_at: new Date(),
        verified_at: new Date(),
      },
      create: {
        id: facility.id,
        name: facility.name,
        address: facility.address,
        area_id: DEMO_AREA_ID,
        latitude: facility.latitude,
        longitude: facility.longitude,
        status: 'APPROVED',
        is_demo: true,
        last_verified_at: new Date(),
        verified_at: new Date(),
      },
    });

    for (const service_code of ['general', 'pediatrics'] as const) {
      await prisma.facilityService.upsert({
        where: { facility_id_service_code: { facility_id: facility.id, service_code } },
        update: {
          verification_status: 'APPROVED',
          verified_at: new Date(),
        },
        create: {
          facility_id: facility.id,
          service_code,
          verification_status: 'APPROVED',
          verified_at: new Date(),
        },
      });
    }
  }
}

async function seedDemoPatient(crypto: ReturnType<typeof createCrypto>) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  await prisma.account.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      id: DEMO_ACCOUNT_ID,
      password_hash: passwordHash,
      display_name: 'Demo Patient',
      status: 'ACTIVE',
    },
    create: {
      id: DEMO_ACCOUNT_ID,
      email: DEMO_EMAIL,
      password_hash: passwordHash,
      display_name: 'Demo Patient',
      status: 'ACTIVE',
    },
  });

  await prisma.accountRole.upsert({
    where: { account_id_role: { account_id: DEMO_ACCOUNT_ID, role: 'PATIENT' } },
    update: {},
    create: { account_id: DEMO_ACCOUNT_ID, role: 'PATIENT' },
  });

  await prisma.patientProfile.upsert({
    where: { account_id: DEMO_ACCOUNT_ID },
    update: {
      id: DEMO_PATIENT_ID,
      home_area_id: DEMO_AREA_ID,
      preferred_language: 'en',
    },
    create: {
      id: DEMO_PATIENT_ID,
      account_id: DEMO_ACCOUNT_ID,
      home_area_id: DEMO_AREA_ID,
      preferred_language: 'en',
    },
  });

  const codeDigest = crypto.digestCode(DEMO_PATIENT_CODE, 'patient');
  if (!codeDigest) throw new Error('Demo patient code must be 12 digits');

  await prisma.patientCode.upsert({
    where: { patient_id: DEMO_PATIENT_ID },
    update: {
      code_digest: codeDigest,
      code_ciphertext: crypto.encrypt(DEMO_PATIENT_CODE, 'patient-code'),
      key_version: Number.parseInt(process.env.ENCRYPTION_KEY_VERSION ?? '1', 10) || 1,
    },
    create: {
      patient_id: DEMO_PATIENT_ID,
      code_digest: codeDigest,
      code_ciphertext: crypto.encrypt(DEMO_PATIENT_CODE, 'patient-code'),
      key_version: Number.parseInt(process.env.ENCRYPTION_KEY_VERSION ?? '1', 10) || 1,
    },
  });

  for (const [field_key, value, display_order] of demoFieldValues) {
    await prisma.patientFieldValue.upsert({
      where: { patient_id_field_key: { patient_id: DEMO_PATIENT_ID, field_key } },
      update: { value, version: 1, source: 'IMPORT' },
      create: {
        patient_id: DEMO_PATIENT_ID,
        field_key,
        value,
        source: 'IMPORT',
      },
    });

    await prisma.emergencyField.upsert({
      where: { patient_id_field_key: { patient_id: DEMO_PATIENT_ID, field_key } },
      update: { display_order },
      create: { patient_id: DEMO_PATIENT_ID, field_key, display_order },
    });
  }
}

async function main() {
  for (const [field_key, label, value_type, emergency_eligible, sort_order] of fields) {
    await prisma.fieldDefinition.upsert({
      where: { field_key },
      update: { label, value_type, emergency_eligible, sort_order, active: true },
      create: { field_key, label, value_type, emergency_eligible, sort_order },
    });
  }

  for (const [service_code, label, description, sort_order] of services) {
    await prisma.service.upsert({
      where: { service_code },
      update: { label, description, sort_order, active: true },
      create: { service_code, label, description, sort_order },
    });
  }

  await seedDirectory();
  await seedDemoPatient(cryptoFromEnv());

  console.log(`Seeded ${fields.length} field definitions and ${services.length} services.`);
  console.log('Seeded demo directory fixtures: Ikeja area, 2 approved facilities.');
  console.log('Demo fixtures:');
  console.log(`  email: ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log(`  patient code: ${DEMO_PATIENT_CODE}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
