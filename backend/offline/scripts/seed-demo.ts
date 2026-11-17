import pg from 'pg';
import { loadConfig } from '../src/config.js';
import { createCrypto } from '../src/security/crypto.js';

// Clearly fictional fixtures for sandbox testing. Never use as production data.
const areaId = '20000000-0000-4000-8000-000000000001';
const hospitalId = '20000000-0000-4000-8000-000000000002';
const childClinicId = '20000000-0000-4000-8000-000000000003';
const patientAccountId = '20000000-0000-4000-8000-000000000004';
const patientId = '20000000-0000-4000-8000-000000000005';
const demoPatientCode = '123456789012';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL to an administrator connection');
const config = loadConfig();
const crypto = createCrypto(config);
const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  await client.query(
    `INSERT INTO directory.areas(id,country_code,region,city,name,center_latitude,center_longitude,is_demo,active)
    VALUES($1,'NG','Lagos','Ikeja','Ikeja demo area',6.6018,3.3515,true,true)
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, is_demo=true, active=true`,
    [areaId],
  );
  await client.query(
    `INSERT INTO directory.facilities(id,name,address,area_id,latitude,longitude,phone,status,is_demo)
    VALUES
      ($1,'Demo Community Hospital','12 Example Road, Ikeja',$3,6.6020,3.3520,NULL,'approved',true),
      ($2,'Demo Child Health Clinic','8 Sample Street, Ikeja',$3,6.6030,3.3530,NULL,'approved',true)
    ON CONFLICT (id) DO UPDATE SET status='approved', is_demo=true, area_id=EXCLUDED.area_id`,
    [hospitalId, childClinicId, areaId],
  );
  await client.query(
    `INSERT INTO directory.facility_services(facility_id,service_code,verification_status,verified_at)
    VALUES($1,'general','approved',now()),($2,'pediatrics','approved',now())
    ON CONFLICT (facility_id,service_code) DO UPDATE
    SET verification_status='approved', verified_at=now()`,
    [hospitalId, childClinicId],
  );
  await client.query(
    `INSERT INTO healthaccess.accounts(id,email_normalized,password_hash,display_name,status)
    VALUES($1,'demo.patient@example.test','demo-not-a-login','Demo Patient','active')
    ON CONFLICT (id) DO UPDATE SET display_name=EXCLUDED.display_name, status='active'`,
    [patientAccountId],
  );
  await client.query(
    `INSERT INTO healthaccess.account_roles(account_id,role) VALUES($1,'patient')
    ON CONFLICT DO NOTHING`,
    [patientAccountId],
  );
  await client.query(
    `INSERT INTO healthaccess.patient_profiles(id,account_id,preferred_language)
    VALUES($1,$2,'en') ON CONFLICT (id) DO NOTHING`,
    [patientId, patientAccountId],
  );
  await client.query(
    `INSERT INTO healthaccess.patient_codes(patient_id,code_digest,code_ciphertext,key_version)
    VALUES($1,$2,$3,1)
    ON CONFLICT (patient_id) DO UPDATE SET code_digest=EXCLUDED.code_digest,
      code_ciphertext=EXCLUDED.code_ciphertext`,
    [
      patientId,
      crypto.digestCode(demoPatientCode),
      crypto.encrypt(demoPatientCode, 'patient-code'),
    ],
  );
  await client.query(
    `INSERT INTO healthaccess.patient_field_values(patient_id,field_key,value,source) VALUES
      ($1,'full_name','"Demo Patient"'::jsonb,'patient'),
      ($1,'allergies','["Penicillin (demo)" ]'::jsonb,'patient'),
      ($1,'current_medications','["Demo medicine"]'::jsonb,'patient'),
      ($1,'emergency_contact_name','"Chika (demo contact)"'::jsonb,'patient')
    ON CONFLICT (patient_id,field_key) DO UPDATE SET value=EXCLUDED.value`,
    [patientId],
  );
  await client.query(
    `INSERT INTO healthaccess.emergency_fields(patient_id,field_key,display_order) VALUES
      ($1,'allergies',1),($1,'emergency_contact_name',2)
    ON CONFLICT (patient_id,field_key) DO UPDATE SET display_order=EXCLUDED.display_order`,
    [patientId],
  );
  console.log({
    seeded: true,
    area: 'Ikeja demo area',
    facilities: ['Demo Community Hospital', 'Demo Child Health Clinic'],
    demoPatientCode,
    emergencyFields: ['allergies', 'emergency_contact_name'],
  });
} finally {
  await client.end();
}
