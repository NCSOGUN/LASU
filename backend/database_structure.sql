BEGIN;

DO $bootstrap$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'healthaccess_owner') THEN
    CREATE ROLE healthaccess_owner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'healthaccess_web') THEN
    CREATE ROLE healthaccess_web NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'healthaccess_telecom') THEN
    CREATE ROLE healthaccess_telecom NOLOGIN;
  END IF;
END
$bootstrap$;

DO $owner_grant$
BEGIN
  IF current_user <> 'healthaccess_owner' THEN
    EXECUTE pg_catalog.format('GRANT healthaccess_owner TO %I', current_user);
    EXECUTE pg_catalog.format('GRANT CONNECT, CREATE ON DATABASE %I TO healthaccess_owner', current_database());
  END IF;
END
$owner_grant$;

DO $public_schema$
BEGIN
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
END
$public_schema$;

SET ROLE healthaccess_owner;

CREATE SCHEMA IF NOT EXISTS healthaccess AUTHORIZATION healthaccess_owner;
CREATE SCHEMA IF NOT EXISTS directory AUTHORIZATION healthaccess_owner;
CREATE SCHEMA IF NOT EXISTS content AUTHORIZATION healthaccess_owner;
CREATE SCHEMA IF NOT EXISTS telecom AUTHORIZATION healthaccess_owner;
CREATE SCHEMA IF NOT EXISTS healthaccess_api AUTHORIZATION healthaccess_owner;

REVOKE ALL ON SCHEMA healthaccess FROM PUBLIC;
REVOKE ALL ON SCHEMA directory FROM PUBLIC;
REVOKE ALL ON SCHEMA content FROM PUBLIC;
REVOKE ALL ON SCHEMA telecom FROM PUBLIC;
REVOKE ALL ON SCHEMA healthaccess_api FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE healthaccess_owner IN SCHEMA healthaccess_api REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE healthaccess_owner IN SCHEMA healthaccess_api REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE healthaccess_owner IN SCHEMA healthaccess_api REVOKE ALL ON SEQUENCES FROM PUBLIC;

CREATE TABLE IF NOT EXISTS directory.areas (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  country_code text NOT NULL DEFAULT 'NG' CHECK (country_code ~ '^[A-Z]{2}$'),
  region text NOT NULL CHECK (length(region) BETWEEN 1 AND 120),
  city text NOT NULL CHECK (length(city) BETWEEN 1 AND 120),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  center_latitude numeric(8,6) CHECK (center_latitude IS NULL OR center_latitude BETWEEN -90 AND 90),
  center_longitude numeric(9,6) CHECK (center_longitude IS NULL OR center_longitude BETWEEN -180 AND 180),
  is_demo boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS directory.area_aliases (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES directory.areas(id) ON DELETE CASCADE,
  alias_normalized text NOT NULL CHECK (alias_normalized = lower(btrim(alias_normalized)) AND length(alias_normalized) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (area_id, alias_normalized)
);

CREATE TABLE IF NOT EXISTS directory.services (
  service_code text PRIMARY KEY CHECK (service_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR length(description) <= 1000),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS directory.sources (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  source_kind text NOT NULL CHECK (source_kind IN ('manual', 'official_register', 'provider_api', 'serper_web', 'seed')),
  publisher text CHECK (publisher IS NULL OR length(publisher) <= 200),
  canonical_url text UNIQUE CHECK (canonical_url IS NULL OR (length(canonical_url) <= 2048 AND canonical_url ~ '^https?://')),
  retrieved_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  query_text text CHECK (query_text IS NULL OR length(query_text) <= 500),
  content_sha256 text CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{32,64}$'),
  trust_tier text NOT NULL CHECK (trust_tier IN ('official', 'approved', 'manual', 'unverified_web')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(metadata::text) <= 4096),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS directory.facilities (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  address text NOT NULL CHECK (length(address) BETWEEN 1 AND 500),
  area_id uuid NOT NULL REFERENCES directory.areas(id) ON DELETE RESTRICT,
  latitude numeric(8,6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  phone text CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'inactive', 'rejected')),
  source_id uuid REFERENCES directory.sources(id) ON DELETE SET NULL,
  last_verified_at timestamptz,
  verified_by_account_id uuid,
  verified_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS directory.facility_services (
  facility_id uuid NOT NULL REFERENCES directory.facilities(id) ON DELETE CASCADE,
  service_code text NOT NULL REFERENCES directory.services(service_code) ON DELETE RESTRICT,
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'approved')),
  source_id uuid REFERENCES directory.sources(id) ON DELETE SET NULL,
  verified_at timestamptz,
  verified_by_account_id uuid,
  availability_note text CHECK (availability_note IS NULL OR length(availability_note) <= 500),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (facility_id, service_code),
  CHECK (verification_status <> 'approved' OR verified_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS directory.web_leads (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES directory.sources(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  address text NOT NULL CHECK (length(address) BETWEEN 1 AND 500),
  phone text CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
  source_url text NOT NULL CHECK (length(source_url) <= 2048 AND source_url ~ '^https?://'),
  snippet text CHECK (snippet IS NULL OR length(snippet) <= 1000),
  observed_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  status text NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'review_candidate', 'rejected')),
  content_fingerprint text NOT NULL CHECK (content_fingerprint ~ '^[0-9a-f]{32,64}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (source_url, content_fingerprint)
);

CREATE TABLE IF NOT EXISTS healthaccess.accounts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  email_normalized text NOT NULL UNIQUE CHECK (email_normalized = lower(btrim(email_normalized)) AND length(email_normalized) <= 320),
  password_hash text NOT NULL CHECK (length(password_hash) BETWEEN 1 AND 512),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),
  idp_subject text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS healthaccess.account_roles (
  account_id uuid NOT NULL REFERENCES healthaccess.accounts(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('patient', 'practitioner', 'directory_admin', 'account_admin')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (account_id, role)
);

CREATE TABLE IF NOT EXISTS healthaccess.auth_sessions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES healthaccess.accounts(id) ON DELETE CASCADE,
  token_digest text NOT NULL UNIQUE CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  recent_auth_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS healthaccess.auth_challenges (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  account_id uuid REFERENCES healthaccess.accounts(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('password_reset', 'phone_verification', 'patient_code_rotate')),
  token_digest text NOT NULL CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  delivery_target_envelope text CHECK (delivery_target_envelope IS NULL OR length(delivery_target_envelope) <= 8192),
  phone_digest text CHECK (phone_digest IS NULL OR phone_digest ~ '^[0-9a-f]{64}$'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS healthaccess.field_definitions (
  field_key text PRIMARY KEY CHECK (field_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  value_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  value_type text NOT NULL CHECK (value_type IN ('string', 'number', 'boolean', 'object', 'string_array')),
  emergency_eligible boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS healthaccess.patient_profiles (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  account_id uuid NOT NULL UNIQUE REFERENCES healthaccess.accounts(id) ON DELETE CASCADE,
  preferred_language text NOT NULL DEFAULT 'en' CHECK (preferred_language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  home_area_id uuid REFERENCES directory.areas(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS healthaccess.practitioner_profiles (
  account_id uuid PRIMARY KEY REFERENCES healthaccess.accounts(id) ON DELETE CASCADE,
  facility_id uuid REFERENCES directory.facilities(id) ON DELETE SET NULL,
  registration_reference_envelope text CHECK (registration_reference_envelope IS NULL OR length(registration_reference_envelope) <= 8192),
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'suspended', 'rejected')),
  verified_by_account_id uuid REFERENCES healthaccess.accounts(id) ON DELETE SET NULL,
  verified_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS healthaccess.patient_field_values (
  patient_id uuid NOT NULL REFERENCES healthaccess.patient_profiles(id) ON DELETE CASCADE,
  field_key text NOT NULL REFERENCES healthaccess.field_definitions(field_key) ON DELETE RESTRICT,
  value jsonb NOT NULL CHECK (jsonb_typeof(value) <> 'null' AND octet_length(value::text) <= 65536),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  source text NOT NULL DEFAULT 'patient' CHECK (source IN ('patient', 'practitioner', 'import')),
  updated_by_account_id uuid REFERENCES healthaccess.accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (patient_id, field_key)
);

CREATE TABLE IF NOT EXISTS healthaccess.emergency_fields (
  patient_id uuid NOT NULL,
  field_key text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (patient_id, field_key),
  FOREIGN KEY (patient_id, field_key) REFERENCES healthaccess.patient_field_values(patient_id, field_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS healthaccess.patient_codes (
  patient_id uuid PRIMARY KEY REFERENCES healthaccess.patient_profiles(id) ON DELETE CASCADE,
  code_digest text NOT NULL UNIQUE CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  code_ciphertext text NOT NULL CHECK (length(code_ciphertext) BETWEEN 1 AND 8192),
  key_version integer NOT NULL CHECK (key_version > 0),
  code_version integer NOT NULL DEFAULT 1 CHECK (code_version > 0),
  rotated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS healthaccess.access_grants (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES healthaccess.patient_profiles(id) ON DELETE CASCADE,
  code_digest text NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by_account_id uuid NOT NULL REFERENCES healthaccess.accounts(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (patient_id, code_digest),
  CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS healthaccess.access_grant_fields (
  grant_id uuid NOT NULL REFERENCES healthaccess.access_grants(id) ON DELETE CASCADE,
  field_key text NOT NULL REFERENCES healthaccess.field_definitions(field_key) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (grant_id, field_key)
);

CREATE TABLE IF NOT EXISTS healthaccess.access_grant_channels (
  grant_id uuid NOT NULL REFERENCES healthaccess.access_grants(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('web_practitioner', 'ussd')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (grant_id, channel)
);

CREATE TABLE IF NOT EXISTS telecom.channel_links (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES healthaccess.patient_profiles(id) ON DELETE CASCADE,
  phone_envelope text NOT NULL CHECK (length(phone_envelope) BETWEEN 1 AND 8192),
  phone_digest text NOT NULL CHECK (phone_digest ~ '^[0-9a-f]{64}$'),
  verified_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS telecom.channel_preferences (
  phone_digest text PRIMARY KEY CHECK (phone_digest ~ '^[0-9a-f]{64}$'),
  locale text NOT NULL DEFAULT 'en' CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  opted_out boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS telecom.rate_limits (
  scope text NOT NULL CHECK (length(scope) BETWEEN 1 AND 200),
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 1 CHECK (hits > 0),
  PRIMARY KEY (scope, window_start)
);

CREATE TABLE IF NOT EXISTS healthaccess.profile_use_consents (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES healthaccess.patient_profiles(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('sms', 'ussd')),
  phone_link_id uuid NOT NULL REFERENCES telecom.channel_links(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (patient_id, channel),
  CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS healthaccess.consent_fields (
  consent_id uuid NOT NULL REFERENCES healthaccess.profile_use_consents(id) ON DELETE CASCADE,
  field_key text NOT NULL REFERENCES healthaccess.field_definitions(field_key) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (consent_id, field_key)
);

CREATE TABLE IF NOT EXISTS telecom.ussd_sessions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  provider text NOT NULL DEFAULT 'africastalking' CHECK (length(provider) BETWEEN 1 AND 60),
  provider_session_id text CHECK (provider_session_id IS NULL OR length(provider_session_id) BETWEEN 1 AND 256),
  phone_digest text NOT NULL CHECK (phone_digest ~ '^[0-9a-f]{64}$'),
  service_code text CHECK (service_code IS NULL OR length(service_code) <= 60),
  state text NOT NULL DEFAULT 'MAIN' CHECK (state IN ('MAIN', 'CARE_SERVICE', 'CARE_LOCATION', 'CARE_AREA_CHOICE', 'CARE_PROFILE_CONFIRM', 'CARE_RESULTS', 'CARE_NO_MATCH', 'EMERGENCY_CODE', 'GRANT_PATIENT_CODE', 'GRANT_ACCESS_CODE', 'RECORD_PAGE', 'END')),
  context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(context::text) <= 4096),
  path_digest text CHECK (path_digest IS NULL OR path_digest ~ '^[0-9a-f]{64}$'),
  path_depth integer NOT NULL DEFAULT -1 CHECK (path_depth >= -1),
  invalid_attempts integer NOT NULL DEFAULT 0 CHECK (invalid_attempts >= 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  read_session_id uuid,
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK (provider_session_id IS NULL OR provider_session_id <> ''),
  UNIQUE (provider, provider_session_id)
);

CREATE TABLE IF NOT EXISTS telecom.sms_inbox (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  provider text NOT NULL DEFAULT 'africastalking' CHECK (length(provider) BETWEEN 1 AND 60),
  provider_message_id text NOT NULL CHECK (length(provider_message_id) BETWEEN 1 AND 256),
  phone_digest text NOT NULL CHECK (phone_digest ~ '^[0-9a-f]{64}$'),
  body_envelope text NOT NULL CHECK (length(body_envelope) BETWEEN 1 AND 16384),
  received_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'processed', 'failed', 'expired')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  lease_until timestamptz,
  claimed_by text CHECK (claimed_by IS NULL OR length(claimed_by) <= 120),
  last_error_code text CHECK (last_error_code IS NULL OR length(last_error_code) <= 120),
  processed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (pg_catalog.now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (provider, provider_message_id)
);

CREATE TABLE IF NOT EXISTS telecom.sms_conversations (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  phone_digest text NOT NULL UNIQUE CHECK (phone_digest ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'idle' CHECK (length(state) BETWEEN 1 AND 60),
  context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(context::text) <= 4096),
  last_input_digest text CHECK (last_input_digest IS NULL OR last_input_digest ~ '^[0-9a-f]{64}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS healthaccess.record_read_sessions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES healthaccess.patient_profiles(id) ON DELETE CASCADE,
  grant_id uuid REFERENCES healthaccess.access_grants(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('emergency', 'grant')),
  channel text NOT NULL CHECK (channel IN ('web_practitioner', 'ussd')),
  account_id uuid REFERENCES healthaccess.accounts(id) ON DELETE CASCADE,
  auth_session_id uuid REFERENCES healthaccess.auth_sessions(id) ON DELETE CASCADE,
  telecom_session_id uuid REFERENCES telecom.ussd_sessions(id) ON DELETE CASCADE,
  phone_digest text CHECK (phone_digest IS NULL OR phone_digest ~ '^[0-9a-f]{64}$'),
  code_version integer,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_read_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK (
    (channel = 'web_practitioner' AND account_id IS NOT NULL AND auth_session_id IS NOT NULL AND telecom_session_id IS NULL AND phone_digest IS NULL)
    OR
    (channel = 'ussd' AND account_id IS NULL AND auth_session_id IS NULL AND telecom_session_id IS NOT NULL AND phone_digest IS NOT NULL)
  ),
  CHECK (
    (purpose = 'emergency' AND grant_id IS NULL AND code_version IS NOT NULL)
    OR
    (purpose = 'grant' AND grant_id IS NOT NULL AND code_version IS NULL)
  ),
  CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS telecom.outbox (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  logical_key text NOT NULL UNIQUE CHECK (length(logical_key) BETWEEN 1 AND 256),
  kind text NOT NULL CHECK (kind IN ('text', 'emergency', 'facility', 'web_lead')),
  recipient_phone_envelope text NOT NULL CHECK (length(recipient_phone_envelope) BETWEEN 1 AND 8192),
  recipient_phone_digest text CHECK (recipient_phone_digest IS NULL OR recipient_phone_digest ~ '^[0-9a-f]{64}$'),
  render_ref jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(render_ref::text) <= 4096),
  payload_envelope text CHECK (payload_envelope IS NULL OR length(payload_envelope) <= 16384),
  read_session_id uuid REFERENCES healthaccess.record_read_sessions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'accepted', 'delivered', 'failed', 'unknown', 'expired', 'dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  lease_until timestamptz,
  claimed_by text CHECK (claimed_by IS NULL OR length(claimed_by) <= 120),
  provider_message_id text CHECK (provider_message_id IS NULL OR length(provider_message_id) <= 256),
  last_error_code text CHECK (last_error_code IS NULL OR length(last_error_code) <= 120),
  accepted_at timestamptz,
  delivered_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (pg_catalog.now() + interval '1 day'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS telecom.delivery_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider text NOT NULL DEFAULT 'africastalking' CHECK (length(provider) BETWEEN 1 AND 60),
  provider_message_id text NOT NULL CHECK (length(provider_message_id) BETWEEN 1 AND 256),
  status text NOT NULL CHECK (length(status) BETWEEN 1 AND 40),
  event_fingerprint text NOT NULL UNIQUE CHECK (event_fingerprint ~ '^[0-9a-f]{64}$'),
  outbox_id uuid REFERENCES telecom.outbox(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS healthaccess.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  request_id text NOT NULL DEFAULT '',
  actor_account_id uuid,
  patient_id uuid,
  channel text NOT NULL CHECK (channel IN ('web', 'sms', 'ussd', 'system')),
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 120),
  resource_type text CHECK (resource_type IS NULL OR length(resource_type) <= 80),
  resource_id uuid,
  outcome text NOT NULL CHECK (outcome IN ('allowed', 'denied', 'error')),
  reason_code text CHECK (reason_code IS NULL OR length(reason_code) <= 120),
  field_keys text[] NOT NULL DEFAULT ARRAY[]::text[],
  actor_ref text CHECK (actor_ref IS NULL OR length(actor_ref) <= 128),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(metadata::text) <= 4096)
);

CREATE TABLE IF NOT EXISTS healthaccess.access_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  channel text NOT NULL CHECK (channel IN ('web', 'sms', 'ussd')),
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 120),
  outcome text NOT NULL CHECK (outcome IN ('allowed', 'denied', 'throttled')),
  target_digest text CHECK (target_digest IS NULL OR target_digest ~ '^[0-9a-f]{64}$'),
  phone_digest text CHECK (phone_digest IS NULL OR phone_digest ~ '^[0-9a-f]{64}$'),
  ip_hash text CHECK (ip_hash IS NULL OR length(ip_hash) <= 128),
  request_id text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL DEFAULT (pg_catalog.now() + interval '30 days')
);

CREATE TABLE IF NOT EXISTS healthaccess.idempotency_records (
  actor_scope text NOT NULL CHECK (length(actor_scope) BETWEEN 1 AND 160),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  request_digest text CHECK (request_digest IS NULL OR request_digest ~ '^[0-9a-f]{32,64}$'),
  resource_type text NOT NULL CHECK (length(resource_type) BETWEEN 1 AND 80),
  resource_id uuid,
  response_envelope text CHECK (response_envelope IS NULL OR length(response_envelope) <= 16384),
  expires_at timestamptz NOT NULL DEFAULT (pg_catalog.now() + interval '1 day'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (actor_scope, idempotency_key)
);

CREATE TABLE IF NOT EXISTS healthaccess.conversations (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  owner_account_id uuid REFERENCES healthaccess.accounts(id) ON DELETE CASCADE,
  anonymous_session_digest text CHECK (anonymous_session_digest IS NULL OR anonymous_session_digest ~ '^[0-9a-f]{64}$'),
  channel text NOT NULL DEFAULT 'web' CHECK (channel IN ('web')),
  language text NOT NULL DEFAULT 'en' CHECK (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'expired')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK ((owner_account_id IS NOT NULL) <> (anonymous_session_digest IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS healthaccess.conversation_messages (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES healthaccess.conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content_envelope text NOT NULL CHECK (length(content_envelope) BETWEEN 1 AND 16384),
  ui_payload jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (octet_length(ui_payload::text) <= 16384),
  model_version text CHECK (model_version IS NULL OR length(model_version) <= 120),
  reviewed_content_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS directory.referral_requests (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  patient_id uuid REFERENCES healthaccess.patient_profiles(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES healthaccess.conversations(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('web', 'sms', 'ussd')),
  service_code text NOT NULL REFERENCES directory.services(service_code) ON DELETE RESTRICT,
  area_id uuid REFERENCES directory.areas(id) ON DELETE SET NULL,
  requested_latitude numeric(8,6) CHECK (requested_latitude IS NULL OR requested_latitude BETWEEN -90 AND 90),
  requested_longitude numeric(9,6) CHECK (requested_longitude IS NULL OR requested_longitude BETWEEN -180 AND 180),
  radius_km numeric(6,2) NOT NULL DEFAULT 25 CHECK (radius_km > 0 AND radius_km <= 200),
  status text NOT NULL CHECK (status IN ('needs_clarification', 'matched', 'no_match')),
  applied_consent_id uuid REFERENCES healthaccess.profile_use_consents(id) ON DELETE SET NULL,
  applied_field_keys text[] NOT NULL DEFAULT ARRAY[]::text[],
  request_id text NOT NULL DEFAULT '',
  requested_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS directory.referral_results (
  referral_id uuid NOT NULL REFERENCES directory.referral_requests(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES directory.facilities(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank > 0),
  distance_km numeric(8,3) CHECK (distance_km IS NULL OR distance_km >= 0),
  distance_basis text NOT NULL CHECK (distance_basis IN ('area_centroid_straight_line', 'coordinates_straight_line', 'none')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  facility_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(facility_snapshot::text) <= 8192),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (referral_id, facility_id),
  UNIQUE (referral_id, rank)
);

CREATE TABLE IF NOT EXISTS content.reviewed_health_content (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  topic_code text NOT NULL CHECK (topic_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  language text NOT NULL DEFAULT 'en' CHECK (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'published', 'retired')),
  reviewer_account_id uuid REFERENCES healthaccess.accounts(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (topic_code, language, version),
  CHECK (status NOT IN ('reviewed', 'published') OR (reviewer_account_id IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS content.reviewed_content_citations (
  content_id uuid NOT NULL REFERENCES content.reviewed_health_content(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES directory.sources(id) ON DELETE RESTRICT,
  citation_label text NOT NULL CHECK (length(citation_label) BETWEEN 1 AND 300),
  locator text CHECK (locator IS NULL OR length(locator) <= 300),
  supports_claim text CHECK (supports_claim IS NULL OR length(supports_claim) <= 1000),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (content_id, source_id, citation_label)
);

CREATE TABLE IF NOT EXISTS content.web_observations (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES directory.sources(id) ON DELETE CASCADE,
  query_text text NOT NULL CHECK (length(query_text) BETWEEN 1 AND 500),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  snippet text CHECK (snippet IS NULL OR length(snippet) <= 2000),
  content_fingerprint text NOT NULL CHECK (content_fingerprint ~ '^[0-9a-f]{32,64}$'),
  observed_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  status text NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'review_candidate', 'rejected')),
  reviewer_account_id uuid REFERENCES healthaccess.accounts(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (source_id, content_fingerprint)
);

CREATE INDEX IF NOT EXISTS areas_lookup_idx ON directory.areas (lower(name), lower(city), lower(region)) WHERE active;
CREATE INDEX IF NOT EXISTS area_aliases_lookup_idx ON directory.area_aliases (alias_normalized);
CREATE INDEX IF NOT EXISTS facilities_area_service_idx ON directory.facilities (area_id, status);
CREATE INDEX IF NOT EXISTS facility_services_service_idx ON directory.facility_services (service_code, facility_id) WHERE verification_status = 'approved';
CREATE INDEX IF NOT EXISTS web_leads_observed_idx ON directory.web_leads (observed_at DESC, status);

CREATE INDEX IF NOT EXISTS auth_sessions_account_idx ON healthaccess.auth_sessions (account_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS access_grants_patient_idx ON healthaccess.access_grants (patient_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS record_read_sessions_telecom_idx ON healthaccess.record_read_sessions (telecom_session_id, expires_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS record_read_sessions_web_idx ON healthaccess.record_read_sessions (account_id, auth_session_id, expires_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS audit_events_patient_idx ON healthaccess.audit_events (patient_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_occurred_idx ON healthaccess.audit_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS access_attempts_target_idx ON healthaccess.access_attempts (action, target_digest, occurred_at DESC);
CREATE INDEX IF NOT EXISTS access_attempts_phone_idx ON healthaccess.access_attempts (action, phone_digest, occurred_at DESC);
CREATE INDEX IF NOT EXISTS referral_requests_patient_idx ON directory.referral_requests (patient_id, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS channel_links_active_phone_idx ON telecom.channel_links (patient_id, phone_digest) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS channel_links_phone_idx ON telecom.channel_links (phone_digest) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS ussd_sessions_phone_idx ON telecom.ussd_sessions (phone_digest, expires_at DESC);
CREATE INDEX IF NOT EXISTS sms_inbox_claim_idx ON telecom.sms_inbox (status, next_attempt_at, lease_until);
CREATE INDEX IF NOT EXISTS outbox_claim_idx ON telecom.outbox (status, next_attempt_at, lease_until);
CREATE INDEX IF NOT EXISTS outbox_read_session_idx ON telecom.outbox (read_session_id);
CREATE INDEX IF NOT EXISTS delivery_events_message_idx ON telecom.delivery_events (provider, provider_message_id, received_at DESC);

INSERT INTO healthaccess.field_definitions (field_key, label, value_schema, value_type, emergency_eligible, sort_order)
VALUES
  ('full_name', 'Name', '{"type":"string"}'::jsonb, 'string', true, 10),
  ('date_of_birth', 'Date of birth', '{"type":"string"}'::jsonb, 'string', true, 20),
  ('allergies', 'Allergies', '{"type":"array","items":{"type":"string"}}'::jsonb, 'string_array', true, 30),
  ('current_medications', 'Medications', '{"type":"array","items":{"type":"string"}}'::jsonb, 'string_array', true, 40),
  ('conditions', 'Conditions', '{"type":"array","items":{"type":"string"}}'::jsonb, 'string_array', true, 50),
  ('blood_group', 'Blood group', '{"type":"string"}'::jsonb, 'string', true, 60),
  ('emergency_contact_name', 'Contact name', '{"type":"string"}'::jsonb, 'string', true, 70),
  ('emergency_contact_phone', 'Contact phone', '{"type":"string"}'::jsonb, 'string', true, 80)
ON CONFLICT (field_key) DO NOTHING;

INSERT INTO directory.services (service_code, label, description, sort_order)
VALUES
  ('general', 'General care', 'General outpatient and primary care', 10),
  ('pediatrics', 'Child health', 'Child and paediatric care', 20),
  ('maternity', 'Maternity care', 'Pregnancy and maternity care', 30)
ON CONFLICT (service_code) DO NOTHING;

CREATE OR REPLACE FUNCTION healthaccess_api._channel()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN (
      pg_catalog.pg_has_role(session_user, 'healthaccess_web', 'member')::int
      + pg_catalog.pg_has_role(session_user, 'healthaccess_telecom', 'member')::int
    ) <> 1 THEN NULL
    WHEN pg_catalog.pg_has_role(session_user, 'healthaccess_web', 'member') THEN 'web'
    WHEN pg_catalog.pg_has_role(session_user, 'healthaccess_telecom', 'member') THEN 'telecom'
  END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._require_channel(p_expected text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF healthaccess_api._channel() IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'healthaccess channel denied' USING ERRCODE = '42501';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._valid_digest(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT p_value IS NOT NULL AND p_value ~ '^[0-9a-f]{64}$'
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._actor_request_id(p_actor jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT pg_catalog.left(coalesce(nullif(p_actor ->> 'request_id', ''), nullif(p_actor ->> 'requestId', ''), ''), 128)
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._actor_phone_digest(p_actor jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(nullif(p_actor ->> 'phone_digest', ''), nullif(p_actor ->> 'phoneDigest', ''))
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._actor_ip_hash(p_actor jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT pg_catalog.left(coalesce(nullif(p_actor ->> 'ip_hash', ''), nullif(p_actor ->> 'ipHash', ''), ''), 128)
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._actor_ussd_session_id(p_actor jsonb)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN coalesce(p_actor ->> 'session_id', p_actor ->> 'sessionId', p_actor ->> 'ussd_session_id', '')
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN coalesce(p_actor ->> 'session_id', p_actor ->> 'sessionId', p_actor ->> 'ussd_session_id')::uuid
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._field_keys(p_fields jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(pg_catalog.array_agg(x.value ->> 'key' ORDER BY x.value ->> 'key'), ARRAY[]::text[])
  FROM pg_catalog.jsonb_array_elements(coalesce(p_fields, '[]'::jsonb)) AS x(value)
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._projection_read(p_fields jsonb, p_read_session_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'available', pg_catalog.jsonb_array_length(coalesce(p_fields, '[]'::jsonb)) > 0,
    'fields', coalesce(p_fields, '[]'::jsonb)
  ) || CASE
    WHEN p_read_session_id IS NULL THEN '{}'::jsonb
    ELSE pg_catalog.jsonb_build_object('read_session_id', p_read_session_id)
  END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._denied()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT pg_catalog.jsonb_build_object('available', false, 'fields', '[]'::jsonb)
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._audit(
  p_request_id text,
  p_actor_account_id uuid,
  p_patient_id uuid,
  p_channel text,
  p_action text,
  p_resource_type text,
  p_resource_id uuid,
  p_outcome text,
  p_reason_code text,
  p_field_keys text[],
  p_actor_ref text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO healthaccess.audit_events (
    request_id, actor_account_id, patient_id, channel, action, resource_type,
    resource_id, outcome, reason_code, field_keys, actor_ref, metadata
  ) VALUES (
    coalesce(p_request_id, ''), p_actor_account_id, p_patient_id, p_channel, p_action,
    p_resource_type, p_resource_id, p_outcome, p_reason_code,
    coalesce(p_field_keys, ARRAY[]::text[]), p_actor_ref,
    coalesce(p_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._audit_read(
  p_channel text,
  p_action text,
  p_patient_id uuid,
  p_outcome text,
  p_reason_code text,
  p_fields jsonb,
  p_request_id text,
  p_actor_ref text
)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT healthaccess_api._audit(
    p_request_id, NULL, p_patient_id, p_channel, p_action, 'patient_record',
    p_patient_id, p_outcome, p_reason_code, healthaccess_api._field_keys(p_fields),
    p_actor_ref, '{}'::jsonb
  )
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._attempt(
  p_channel text,
  p_action text,
  p_outcome text,
  p_target_digest text,
  p_phone_digest text,
  p_ip_hash text,
  p_request_id text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  INSERT INTO healthaccess.access_attempts (
    channel, action, outcome, target_digest, phone_digest, ip_hash, request_id
  ) VALUES (p_channel, p_action, p_outcome, p_target_digest, p_phone_digest, p_ip_hash, coalesce(p_request_id, ''))
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._too_many_attempts(
  p_channel text,
  p_action text,
  p_target_digest text,
  p_phone_digest text,
  p_ip_hash text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RETURN false;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      coalesce(p_channel, '') || ':' || coalesce(p_action, '') || ':' ||
      coalesce(p_target_digest, '') || ':' || coalesce(p_phone_digest, '') || ':' ||
      coalesce(p_ip_hash, ''), 0::bigint
    )
  );
  SELECT pg_catalog.count(*) INTO v_count
  FROM healthaccess.access_attempts a
  WHERE a.channel = p_channel
    AND a.action = p_action
    AND a.occurred_at > pg_catalog.now() - pg_catalog.make_interval(secs => greatest(p_window_seconds, 1))
    AND a.outcome IN ('denied', 'throttled')
    AND (p_target_digest IS NULL OR a.target_digest = p_target_digest)
    AND (p_phone_digest IS NULL OR a.phone_digest = p_phone_digest)
    AND (p_ip_hash IS NULL OR a.ip_hash = p_ip_hash);
  RETURN v_count >= p_limit;
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._emergency_projection(p_patient_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'key', fd.field_key,
        'label', fd.label,
        'value', pfv.value
      ) ORDER BY ef.display_order, fd.sort_order, fd.field_key
    ),
    '[]'::jsonb
  )
  FROM healthaccess.emergency_fields ef
  JOIN healthaccess.patient_field_values pfv
    ON pfv.patient_id = ef.patient_id AND pfv.field_key = ef.field_key
  JOIN healthaccess.field_definitions fd
    ON fd.field_key = ef.field_key
  WHERE ef.patient_id = p_patient_id AND fd.active
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._grant_projection(p_grant_id uuid, p_patient_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'key', fd.field_key,
        'label', fd.label,
        'value', pfv.value
      ) ORDER BY fd.sort_order, fd.field_key
    ),
    '[]'::jsonb
  )
  FROM healthaccess.access_grant_fields agf
  JOIN healthaccess.access_grants g
    ON g.id = agf.grant_id AND g.patient_id = p_patient_id
  JOIN healthaccess.patient_field_values pfv
    ON pfv.patient_id = g.patient_id AND pfv.field_key = agf.field_key
  JOIN healthaccess.field_definitions fd
    ON fd.field_key = agf.field_key
  WHERE agf.grant_id = p_grant_id AND fd.active
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._consent_projection(p_consent_id uuid, p_patient_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'key', fd.field_key,
        'label', fd.label,
        'value', pfv.value
      ) ORDER BY fd.sort_order, fd.field_key
    ),
    '[]'::jsonb
  )
  FROM healthaccess.consent_fields cf
  JOIN healthaccess.patient_field_values pfv
    ON pfv.patient_id = p_patient_id AND pfv.field_key = cf.field_key
  JOIN healthaccess.field_definitions fd
    ON fd.field_key = cf.field_key
  WHERE cf.consent_id = p_consent_id AND fd.active
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._web_session(p_auth_session_digest text)
RETURNS TABLE(account_id uuid, auth_session_id uuid, patient_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT a.id, s.id, p.id
  FROM healthaccess.auth_sessions s
  JOIN healthaccess.accounts a ON a.id = s.account_id
  LEFT JOIN healthaccess.patient_profiles p ON p.account_id = a.id
  WHERE s.token_digest = p_auth_session_digest
    AND s.revoked_at IS NULL
    AND s.expires_at > pg_catalog.now()
    AND a.status = 'active'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._web_recent_auth(p_auth_session_digest text, p_seconds integer DEFAULT 900)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT coalesce((
    SELECT s.recent_auth_at > pg_catalog.now() - pg_catalog.make_interval(secs => greatest(p_seconds, 1))
    FROM healthaccess.auth_sessions s
    WHERE s.token_digest = p_auth_session_digest
      AND s.revoked_at IS NULL
      AND s.expires_at > pg_catalog.now()
    LIMIT 1
  ), false)
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._practitioner_ok(p_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM healthaccess.account_roles ar
    JOIN healthaccess.practitioner_profiles pp ON pp.account_id = ar.account_id
    WHERE ar.account_id = p_account_id
      AND ar.role = 'practitioner'
      AND pp.verification_status = 'approved'
  )
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._ussd_live(p_session_id uuid, p_phone_digest text)
RETURNS TABLE(id uuid, expires_at timestamptz, read_session_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT s.id, s.expires_at, s.read_session_id
  FROM telecom.ussd_sessions s
  WHERE s.id = p_session_id
    AND s.phone_digest = p_phone_digest
    AND s.ended_at IS NULL
    AND s.expires_at > pg_catalog.now()
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._consent_live(p_consent_id uuid, p_phone_digest text)
RETURNS TABLE(patient_id uuid, channel text, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT c.patient_id, c.channel, c.expires_at
  FROM healthaccess.profile_use_consents c
  JOIN telecom.channel_links l ON l.id = c.phone_link_id
  WHERE c.id = p_consent_id
    AND l.phone_digest = p_phone_digest
    AND l.revoked_at IS NULL
    AND (l.expires_at IS NULL OR l.expires_at > pg_catalog.now())
    AND c.revoked_at IS NULL
    AND c.expires_at > pg_catalog.now()
$$;

CREATE OR REPLACE FUNCTION healthaccess_api._area_distance(
  p_lat1 numeric, p_lon1 numeric, p_lat2 numeric, p_lon2 numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_lat1 IS NULL OR p_lon1 IS NULL OR p_lat2 IS NULL OR p_lon2 IS NULL THEN NULL
    ELSE pg_catalog.round((
      6371.0 * 2.0 * pg_catalog.asin(pg_catalog.sqrt(
        pg_catalog.power(pg_catalog.sin(pg_catalog.radians(p_lat2 - p_lat1) / 2.0), 2)
        + pg_catalog.cos(pg_catalog.radians(p_lat1))
        * pg_catalog.cos(pg_catalog.radians(p_lat2))
        * pg_catalog.power(pg_catalog.sin(pg_catalog.radians(p_lon2 - p_lon1) / 2.0), 2)
      ))
    )::numeric, 3)
  END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.list_services()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'service_code', s.service_code,
        'label', s.label,
        'description', s.description
      ) ORDER BY s.sort_order, s.service_code
    ), '[]'::jsonb
  )
  FROM directory.services s
  WHERE s.active
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.find_areas(p_query text, p_limit integer DEFAULT 5)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH q AS (
    SELECT pg_catalog.lower(pg_catalog.btrim(coalesce(p_query, ''))) AS value
  ), matches AS (
    SELECT a.id, a.name, a.region, a.city,
      pg_catalog.min(CASE
        WHEN pg_catalog.lower(a.name) = q.value
          OR pg_catalog.lower(a.city) = q.value
          OR pg_catalog.lower(a.region) = q.value
          OR aa.alias_normalized = q.value THEN 0
        ELSE 1
      END) AS rank
    FROM directory.areas a
    CROSS JOIN q
    LEFT JOIN directory.area_aliases aa ON aa.area_id = a.id
    WHERE a.active
      AND a.country_code = 'NG'
      AND (
        q.value = ''
        OR pg_catalog.lower(a.name) LIKE q.value || '%'
        OR pg_catalog.lower(a.city) LIKE q.value || '%'
        OR pg_catalog.lower(a.region) LIKE q.value || '%'
        OR aa.alias_normalized LIKE q.value || '%'
      )
    GROUP BY a.id, a.name, a.region, a.city
    ORDER BY rank, a.name
    LIMIT greatest(1, least(coalesce(p_limit, 5), 10))
  )
  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'region', m.region,
        'city', m.city
      ) ORDER BY m.rank, m.name
    ), '[]'::jsonb
  )
  FROM matches m
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.find_facilities(
  p_service_code text,
  p_area_id uuid,
  p_radius_km numeric DEFAULT 25,
  p_limit integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH area AS (
    SELECT a.id, a.country_code, a.center_latitude, a.center_longitude
    FROM directory.areas a
    WHERE a.id = p_area_id AND a.active
  ), eligible AS (
    SELECT f.id, f.name, f.address, f.phone, f.is_demo, f.area_id, a.id AS requested_area_id, fs.service_code,
      healthaccess_api._area_distance(a.center_latitude, a.center_longitude, f.latitude, f.longitude) AS distance_km
    FROM area a
    JOIN directory.facilities f ON f.status = 'approved'
    JOIN directory.areas facility_area ON facility_area.id = f.area_id
      AND facility_area.active AND facility_area.country_code = a.country_code
    JOIN directory.facility_services fs ON fs.facility_id = f.id
      AND fs.service_code = p_service_code
      AND fs.verification_status = 'approved'
    JOIN directory.services s ON s.service_code = fs.service_code AND s.active
  ), bounded AS (
    SELECT e.*
    FROM eligible e
    WHERE (e.distance_km IS NULL AND e.area_id = e.requested_area_id)
      OR e.distance_km <= least(greatest(coalesce(p_radius_km, 25), 1), 200)
    ORDER BY e.distance_km NULLS LAST, e.name
    LIMIT greatest(1, least(coalesce(p_limit, 3), 10))
  )
  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'address', b.address,
        'phone', b.phone,
        'distance_km', b.distance_km,
        'is_demo', b.is_demo,
        'service_code', b.service_code
      ) ORDER BY b.distance_km NULLS LAST, b.name
    ), '[]'::jsonb
  )
  FROM bounded b
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.get_facility(p_facility_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'id', f.id,
    'name', f.name,
    'address', f.address,
    'area_id', f.area_id,
    'latitude', f.latitude,
    'longitude', f.longitude,
    'phone', f.phone,
    'last_verified_at', f.last_verified_at,
    'verified_at', f.verified_at,
    'is_demo', f.is_demo,
    'source_trust', coalesce(s.trust_tier, 'unknown'),
    'services', coalesce((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'service_code', fs.service_code,
          'label', sv.label,
          'availability_note', fs.availability_note
        ) ORDER BY sv.sort_order, sv.service_code
      )
      FROM directory.facility_services fs
      JOIN directory.services sv ON sv.service_code = fs.service_code AND sv.active
      WHERE fs.facility_id = f.id AND fs.verification_status = 'approved'
    ), '[]'::jsonb)
  )
  FROM directory.facilities f
  LEFT JOIN directory.sources s ON s.id = f.source_id
  WHERE f.id = p_facility_id AND f.status = 'approved'
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.get_web_lead(p_web_lead_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'id', w.id,
    'name', w.name,
    'address', w.address,
    'phone', w.phone,
    'source_url', w.source_url,
    'snippet', w.snippet,
    'observed_at', w.observed_at,
    'status', w.status,
    'source_trust', s.trust_tier
  )
  FROM directory.web_leads w
  JOIN directory.sources s ON s.id = w.source_id
  WHERE w.id = p_web_lead_id AND w.status IN ('unverified', 'review_candidate')
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.sms_store_web_leads(p_leads jsonb, p_actor jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_lead jsonb;
  v_ord integer;
  v_name text;
  v_address text;
  v_phone text;
  v_url text;
  v_snippet text;
  v_title text;
  v_fingerprint text;
  v_source_id uuid;
  v_lead_id uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  PERFORM healthaccess_api._require_channel('telecom');
  IF p_leads IS NULL OR pg_catalog.jsonb_typeof(p_leads) <> 'array' THEN
    RETURN pg_catalog.jsonb_build_object('available', false, 'ids', '[]'::jsonb);
  END IF;

  FOR v_lead, v_ord IN
    SELECT x.value, x.ord
    FROM pg_catalog.jsonb_array_elements(p_leads) WITH ORDINALITY AS x(value, ord)
    WHERE x.ord <= 5
  LOOP
    v_name := pg_catalog.left(nullif(pg_catalog.btrim(v_lead ->> 'name'), ''), 200);
    v_address := pg_catalog.left(nullif(pg_catalog.btrim(v_lead ->> 'address'), ''), 500);
    v_url := pg_catalog.left(nullif(pg_catalog.btrim(v_lead ->> 'source_url'), ''), 2048);
    v_title := pg_catalog.left(nullif(pg_catalog.btrim(v_lead ->> 'title'), ''), 300);
    v_snippet := pg_catalog.left(nullif(pg_catalog.btrim(v_lead ->> 'snippet'), ''), 1000);
    v_phone := nullif(pg_catalog.btrim(v_lead ->> 'phone'), '');
    IF v_phone IS NOT NULL AND v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
      v_phone := NULL;
    END IF;
    IF v_name IS NULL OR v_address IS NULL OR v_url IS NULL OR v_url !~ '^https?://' THEN
      CONTINUE;
    END IF;
    v_fingerprint := nullif(pg_catalog.btrim(v_lead ->> 'content_fingerprint'), '');
    IF v_fingerprint IS NULL OR v_fingerprint !~ '^[0-9a-f]{32,64}$' THEN
      v_fingerprint := pg_catalog.md5(pg_catalog.lower(v_name) || '|' || pg_catalog.lower(v_address) || '|' || v_url);
    END IF;

    INSERT INTO directory.sources (
      source_kind, publisher, canonical_url, retrieved_at, query_text, trust_tier, metadata
    ) VALUES (
      'serper_web', NULL, v_url, pg_catalog.now(), NULL, 'unverified_web',
      pg_catalog.jsonb_build_object('title', v_title)
    )
    ON CONFLICT (canonical_url) DO UPDATE SET retrieved_at = EXCLUDED.retrieved_at
    RETURNING id INTO v_source_id;

    INSERT INTO directory.web_leads (
      source_id, name, address, phone, source_url, snippet, observed_at, status, content_fingerprint
    ) VALUES (
      v_source_id, v_name, v_address, v_phone, v_url, v_snippet, pg_catalog.now(), 'unverified', v_fingerprint
    )
    ON CONFLICT (source_url, content_fingerprint) DO UPDATE SET
      name = EXCLUDED.name,
      address = EXCLUDED.address,
      phone = EXCLUDED.phone,
      snippet = EXCLUDED.snippet,
      observed_at = EXCLUDED.observed_at
    RETURNING id INTO v_lead_id;

    v_ids := pg_catalog.array_append(v_ids, v_lead_id);
  END LOOP;

  RETURN pg_catalog.jsonb_build_object('available', true, 'ids', pg_catalog.to_jsonb(v_ids));
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.telecom_record_referral(
  p_service_code text,
  p_area_id uuid,
  p_facility_ids uuid[],
  p_consent_id uuid,
  p_actor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_phone text := healthaccess_api._actor_phone_digest(p_actor);
  v_req text := healthaccess_api._actor_request_id(p_actor);
  v_channel text := CASE WHEN healthaccess_api._actor_ussd_session_id(p_actor) IS NULL THEN 'sms' ELSE 'ussd' END;
  v_patient uuid;
  v_area record;
  v_referral_id uuid;
  v_fid uuid;
  v_ord integer;
  v_count integer := 0;
  v_distance numeric;
  v_facility record;
BEGIN
  PERFORM healthaccess_api._require_channel('telecom');
  IF v_channel NOT IN ('sms', 'ussd') THEN
    v_channel := 'sms';
  END IF;
  IF p_facility_ids IS NULL OR pg_catalog.cardinality(p_facility_ids) = 0 THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM directory.services s WHERE s.service_code = p_service_code AND s.active) THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  SELECT a.id, a.center_latitude, a.center_longitude INTO v_area
  FROM directory.areas a WHERE a.id = p_area_id AND a.active;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;

  IF p_consent_id IS NOT NULL THEN
    SELECT c.patient_id INTO v_patient
    FROM healthaccess_api._consent_live(p_consent_id, v_phone) c;
  END IF;

  IF v_req <> '' THEN
    SELECT r.id INTO v_referral_id
    FROM directory.referral_requests r
    WHERE r.request_id = v_req AND r.channel = v_channel
    ORDER BY r.requested_at, r.id
    LIMIT 1;
    IF FOUND THEN
      RETURN pg_catalog.jsonb_build_object('available', true, 'referral_id', v_referral_id, 'duplicate', true);
    END IF;
  END IF;

  INSERT INTO directory.referral_requests (
    patient_id, channel, service_code, area_id, radius_km, status, applied_consent_id, request_id
  ) VALUES (
    v_patient, v_channel, p_service_code, p_area_id, 25, 'matched', p_consent_id, v_req
  ) RETURNING id INTO v_referral_id;

  FOR v_fid, v_ord IN
    SELECT x.fid, pg_catalog.min(x.ord)
    FROM pg_catalog.unnest(p_facility_ids) WITH ORDINALITY AS x(fid, ord)
    GROUP BY x.fid
    ORDER BY pg_catalog.min(x.ord)
  LOOP
    SELECT f.id, f.name, f.address, f.phone, f.last_verified_at,
      healthaccess_api._area_distance(v_area.center_latitude, v_area.center_longitude, f.latitude, f.longitude) AS distance_km
    INTO v_facility
    FROM directory.facilities f
    JOIN directory.facility_services fs ON fs.facility_id = f.id
      AND fs.service_code = p_service_code
      AND fs.verification_status = 'approved'
    WHERE f.id = v_fid AND f.status = 'approved';
    IF FOUND THEN
      v_count := v_count + 1;
      INSERT INTO directory.referral_results (
        referral_id, facility_id, rank, distance_km, distance_basis, reason, facility_snapshot
      ) VALUES (
        v_referral_id, v_facility.id, v_count, v_facility.distance_km,
        CASE WHEN v_facility.distance_km IS NULL THEN 'none' ELSE 'area_centroid_straight_line' END,
        'Directory service match',
        pg_catalog.jsonb_build_object(
          'name', v_facility.name,
          'address', v_facility.address,
          'phone', v_facility.phone,
          'last_verified_at', v_facility.last_verified_at
        )
      );
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    DELETE FROM directory.referral_requests r WHERE r.id = v_referral_id;
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;

  PERFORM healthaccess_api._audit(
    v_req, NULL, v_patient, v_channel, 'referral_create', 'directory', v_referral_id,
    'allowed', NULL, ARRAY[]::text[], v_phone, '{}'::jsonb
  );
  RETURN pg_catalog.jsonb_build_object('available', true, 'referral_id', v_referral_id);
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.sms_read_emergency_summary(p_code_digest text, p_actor jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_phone text := healthaccess_api._actor_phone_digest(p_actor);
  v_req text := healthaccess_api._actor_request_id(p_actor);
  v_patient uuid;
  v_version integer;
  v_fields jsonb;
BEGIN
  PERFORM healthaccess_api._require_channel('telecom');
  IF NOT healthaccess_api._valid_digest(p_code_digest) THEN
    PERFORM healthaccess_api._attempt('sms', 'emergency_lookup', 'denied', p_code_digest, v_phone, NULL, v_req);
    PERFORM healthaccess_api._audit_read('sms', 'emergency_lookup', NULL, 'denied', 'invalid_digest', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;
  IF healthaccess_api._too_many_attempts('sms', 'emergency_lookup', p_code_digest, v_phone, NULL, 20, 60) THEN
    PERFORM healthaccess_api._attempt('sms', 'emergency_lookup', 'throttled', p_code_digest, v_phone, NULL, v_req);
    PERFORM healthaccess_api._audit_read('sms', 'emergency_lookup', NULL, 'denied', 'throttled', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;

  SELECT pc.patient_id, pc.code_version INTO v_patient, v_version
  FROM healthaccess.patient_codes pc
  WHERE pc.code_digest = p_code_digest;
  IF v_patient IS NULL THEN
    PERFORM healthaccess_api._attempt('sms', 'emergency_lookup', 'denied', p_code_digest, v_phone, NULL, v_req);
    PERFORM healthaccess_api._audit_read('sms', 'emergency_lookup', NULL, 'denied', 'unknown_code', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;

  v_fields := healthaccess_api._emergency_projection(v_patient);
  IF pg_catalog.jsonb_array_length(v_fields) = 0 THEN
    PERFORM healthaccess_api._attempt('sms', 'emergency_lookup', 'denied', p_code_digest, v_phone, NULL, v_req);
    PERFORM healthaccess_api._audit_read('sms', 'emergency_lookup', v_patient, 'denied', 'no_shared_fields', v_fields, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;

  PERFORM healthaccess_api._attempt('sms', 'emergency_lookup', 'allowed', p_code_digest, v_phone, NULL, v_req);
  PERFORM healthaccess_api._audit_read('sms', 'emergency_lookup', v_patient, 'allowed', NULL, v_fields, v_req, v_phone);
  RETURN healthaccess_api._projection_read(v_fields, NULL);
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.ussd_read_emergency_summary(p_code_digest text, p_actor jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_sid uuid := healthaccess_api._actor_ussd_session_id(p_actor);
  v_phone text := healthaccess_api._actor_phone_digest(p_actor);
  v_req text := healthaccess_api._actor_request_id(p_actor);
  v_session_exp timestamptz;
  v_patient uuid;
  v_version integer;
  v_fields jsonb;
  v_read_id uuid;
BEGIN
  PERFORM healthaccess_api._require_channel('telecom');
  IF v_sid IS NULL OR NOT healthaccess_api._valid_digest(v_phone) THEN
    PERFORM healthaccess_api._audit_read('ussd', 'emergency_lookup', NULL, 'denied', 'invalid_session', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;
  SELECT u.expires_at INTO v_session_exp
  FROM healthaccess_api._ussd_live(v_sid, v_phone) u;
  IF v_session_exp IS NULL THEN
    PERFORM healthaccess_api._audit_read('ussd', 'emergency_lookup', NULL, 'denied', 'invalid_session', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;
  IF NOT healthaccess_api._valid_digest(p_code_digest) THEN
    PERFORM healthaccess_api._attempt('ussd', 'emergency_lookup', 'denied', p_code_digest, v_phone, NULL, v_req);
    PERFORM healthaccess_api._audit_read('ussd', 'emergency_lookup', NULL, 'denied', 'invalid_digest', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;
  IF healthaccess_api._too_many_attempts('ussd', 'emergency_lookup', p_code_digest, v_phone, NULL, 20, 60) THEN
    PERFORM healthaccess_api._attempt('ussd', 'emergency_lookup', 'throttled', p_code_digest, v_phone, NULL, v_req);
    PERFORM healthaccess_api._audit_read('ussd', 'emergency_lookup', NULL, 'denied', 'throttled', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;

  SELECT pc.patient_id, pc.code_version INTO v_patient, v_version
  FROM healthaccess.patient_codes pc
  WHERE pc.code_digest = p_code_digest;
  IF v_patient IS NULL THEN
    PERFORM healthaccess_api._attempt('ussd', 'emergency_lookup', 'denied', p_code_digest, v_phone, NULL, v_req);
    PERFORM healthaccess_api._audit_read('ussd', 'emergency_lookup', NULL, 'denied', 'unknown_code', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;

  v_fields := healthaccess_api._emergency_projection(v_patient);
  IF pg_catalog.jsonb_array_length(v_fields) = 0 THEN
    PERFORM healthaccess_api._attempt('ussd', 'emergency_lookup', 'denied', p_code_digest, v_phone, NULL, v_req);
    PERFORM healthaccess_api._audit_read('ussd', 'emergency_lookup', v_patient, 'denied', 'no_shared_fields', v_fields, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;

  SELECT r.id INTO v_read_id
  FROM healthaccess.record_read_sessions r
  WHERE r.telecom_session_id = v_sid
    AND r.phone_digest = v_phone
    AND r.purpose = 'emergency'
    AND r.patient_id = v_patient
    AND r.code_version = v_version
    AND r.revoked_at IS NULL
    AND r.expires_at > pg_catalog.now()
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF v_read_id IS NULL THEN
    INSERT INTO healthaccess.record_read_sessions (
      patient_id, purpose, channel, telecom_session_id, phone_digest, code_version, expires_at
    ) VALUES (
      v_patient, 'emergency', 'ussd', v_sid, v_phone, v_version,
      least(pg_catalog.now() + interval '5 minutes', v_session_exp)
    ) RETURNING id INTO v_read_id;
  ELSE
    UPDATE healthaccess.record_read_sessions
    SET last_read_at = pg_catalog.now()
    WHERE id = v_read_id;
  END IF;

  UPDATE telecom.ussd_sessions
  SET read_session_id = v_read_id, updated_at = pg_catalog.now(), version = version + 1
  WHERE id = v_sid;

  PERFORM healthaccess_api._attempt('ussd', 'emergency_lookup', 'allowed', p_code_digest, v_phone, NULL, v_req);
  PERFORM healthaccess_api._audit_read('ussd', 'emergency_lookup', v_patient, 'allowed', NULL, v_fields, v_req, v_phone);
  RETURN healthaccess_api._projection_read(v_fields, v_read_id);
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.ussd_open_granted_record(
  p_patient_code_digest text,
  p_grant_code_digest text,
  p_actor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_sid uuid := healthaccess_api._actor_ussd_session_id(p_actor);
  v_phone text := healthaccess_api._actor_phone_digest(p_actor);
  v_req text := healthaccess_api._actor_request_id(p_actor);
  v_session_exp timestamptz;
  v_patient uuid;
  v_grant_id uuid;
  v_grant_exp timestamptz;
  v_fields jsonb;
  v_read_id uuid;
BEGIN
  PERFORM healthaccess_api._require_channel('telecom');
  IF v_sid IS NULL OR NOT healthaccess_api._valid_digest(v_phone) THEN
    PERFORM healthaccess_api._audit_read('ussd', 'grant_open', NULL, 'denied', 'invalid_session', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;
  SELECT u.expires_at INTO v_session_exp
  FROM healthaccess_api._ussd_live(v_sid, v_phone) u;
  IF v_session_exp IS NULL THEN
    PERFORM healthaccess_api._audit_read('ussd', 'grant_open', NULL, 'denied', 'invalid_session', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;
  IF NOT healthaccess_api._valid_digest(p_patient_code_digest)
    OR NOT healthaccess_api._valid_digest(p_grant_code_digest) THEN
    PERFORM healthaccess_api._attempt('ussd', 'grant_open', 'denied', p_grant_code_digest, v_phone, NULL, v_req);
    PERFORM healthaccess_api._audit_read('ussd', 'grant_open', NULL, 'denied', 'invalid_digest', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;
  IF healthaccess_api._too_many_attempts('ussd', 'grant_open', p_grant_code_digest, v_phone, NULL, 5, 900) THEN
    PERFORM healthaccess_api._attempt('ussd', 'grant_open', 'throttled', p_grant_code_digest, v_phone, NULL, v_req);
    PERFORM healthaccess_api._audit_read('ussd', 'grant_open', NULL, 'denied', 'throttled', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;

  SELECT pc.patient_id INTO v_patient
  FROM healthaccess.patient_codes pc
  WHERE pc.code_digest = p_patient_code_digest;
  IF v_patient IS NULL THEN
    PERFORM healthaccess_api._attempt('ussd', 'grant_open', 'denied', p_grant_code_digest, v_phone, NULL, v_req);
    PERFORM healthaccess_api._audit_read('ussd', 'grant_open', NULL, 'denied', 'unknown_patient_code', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;

  SELECT g.id, g.expires_at INTO v_grant_id, v_grant_exp
  FROM healthaccess.access_grants g
  WHERE g.patient_id = v_patient
    AND g.code_digest = p_grant_code_digest
    AND g.revoked_at IS NULL
    AND g.expires_at > pg_catalog.now();
  IF v_grant_id IS NULL THEN
    PERFORM healthaccess_api._attempt('ussd', 'grant_open', 'denied', p_grant_code_digest, v_phone, NULL, v_req);
    PERFORM healthaccess_api._audit_read('ussd', 'grant_open', v_patient, 'denied', 'grant_unavailable', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM healthaccess.access_grant_channels c
    WHERE c.grant_id = v_grant_id AND c.channel = 'ussd'
  ) THEN
    PERFORM healthaccess_api._attempt('ussd', 'grant_open', 'denied', p_grant_code_digest, v_phone, NULL, v_req);
    PERFORM healthaccess_api._audit_read('ussd', 'grant_open', v_patient, 'denied', 'wrong_channel', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;

  v_fields := healthaccess_api._grant_projection(v_grant_id, v_patient);
  IF pg_catalog.jsonb_array_length(v_fields) = 0 THEN
    PERFORM healthaccess_api._attempt('ussd', 'grant_open', 'denied', p_grant_code_digest, v_phone, NULL, v_req);
    PERFORM healthaccess_api._audit_read('ussd', 'grant_open', v_patient, 'denied', 'no_fields', v_fields, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;

  SELECT r.id INTO v_read_id
  FROM healthaccess.record_read_sessions r
  WHERE r.telecom_session_id = v_sid
    AND r.phone_digest = v_phone
    AND r.grant_id = v_grant_id
    AND r.purpose = 'grant'
    AND r.revoked_at IS NULL
    AND r.expires_at > pg_catalog.now()
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF v_read_id IS NULL THEN
    INSERT INTO healthaccess.record_read_sessions (
      patient_id, grant_id, purpose, channel, telecom_session_id, phone_digest, expires_at
    ) VALUES (
      v_patient, v_grant_id, 'grant', 'ussd', v_sid, v_phone,
      least(pg_catalog.now() + interval '5 minutes', v_grant_exp, v_session_exp)
    ) RETURNING id INTO v_read_id;
  ELSE
    UPDATE healthaccess.record_read_sessions
    SET last_read_at = pg_catalog.now()
    WHERE id = v_read_id;
  END IF;

  UPDATE telecom.ussd_sessions
  SET read_session_id = v_read_id, updated_at = pg_catalog.now(), version = version + 1
  WHERE id = v_sid;

  PERFORM healthaccess_api._attempt('ussd', 'grant_open', 'allowed', p_grant_code_digest, v_phone, NULL, v_req);
  PERFORM healthaccess_api._audit_read('ussd', 'grant_open', v_patient, 'allowed', NULL, v_fields, v_req, v_phone);
  RETURN healthaccess_api._projection_read(v_fields, v_read_id);
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.ussd_read_granted_record(p_read_session_id uuid, p_actor jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_sid uuid := healthaccess_api._actor_ussd_session_id(p_actor);
  v_phone text := healthaccess_api._actor_phone_digest(p_actor);
  v_req text := healthaccess_api._actor_request_id(p_actor);
  v_read healthaccess.record_read_sessions%ROWTYPE;
  v_grant_exp timestamptz;
  v_grant_revoked timestamptz;
  v_fields jsonb;
BEGIN
  PERFORM healthaccess_api._require_channel('telecom');
  IF v_sid IS NULL OR NOT healthaccess_api._valid_digest(v_phone) THEN
    PERFORM healthaccess_api._audit_read('ussd', 'grant_read', NULL, 'denied', 'invalid_session', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM healthaccess_api._ussd_live(v_sid, v_phone)) THEN
    PERFORM healthaccess_api._audit_read('ussd', 'grant_read', NULL, 'denied', 'invalid_session', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;

  SELECT r.* INTO v_read
  FROM healthaccess.record_read_sessions r
  WHERE r.id = p_read_session_id
    AND r.telecom_session_id = v_sid
    AND r.phone_digest = v_phone
    AND r.channel = 'ussd'
    AND r.purpose = 'grant'
    AND r.revoked_at IS NULL
    AND r.expires_at > pg_catalog.now();
  IF NOT FOUND THEN
    PERFORM healthaccess_api._audit_read('ussd', 'grant_read', NULL, 'denied', 'read_session_unavailable', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;

  SELECT g.expires_at, g.revoked_at INTO v_grant_exp, v_grant_revoked
  FROM healthaccess.access_grants g
  WHERE g.id = v_read.grant_id AND g.patient_id = v_read.patient_id;
  IF v_grant_exp IS NULL OR v_grant_revoked IS NOT NULL OR v_grant_exp <= pg_catalog.now()
    OR NOT EXISTS (
      SELECT 1 FROM healthaccess.access_grant_channels c
      WHERE c.grant_id = v_read.grant_id AND c.channel = 'ussd'
    ) THEN
    UPDATE healthaccess.record_read_sessions SET revoked_at = pg_catalog.now() WHERE id = v_read.id;
    PERFORM healthaccess_api._audit_read('ussd', 'grant_read', v_read.patient_id, 'denied', 'grant_unavailable', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;

  v_fields := healthaccess_api._grant_projection(v_read.grant_id, v_read.patient_id);
  IF pg_catalog.jsonb_array_length(v_fields) = 0 THEN
    PERFORM healthaccess_api._audit_read('ussd', 'grant_read', v_read.patient_id, 'denied', 'no_fields', v_fields, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;

  UPDATE healthaccess.record_read_sessions
  SET last_read_at = pg_catalog.now()
  WHERE id = v_read.id;
  PERFORM healthaccess_api._audit_read('ussd', 'grant_read', v_read.patient_id, 'allowed', NULL, v_fields, v_req, v_phone);
  RETURN healthaccess_api._projection_read(v_fields, v_read.id);
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.ussd_close_granted_record(p_read_session_id uuid, p_actor jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_sid uuid := healthaccess_api._actor_ussd_session_id(p_actor);
  v_phone text := healthaccess_api._actor_phone_digest(p_actor);
  v_req text := healthaccess_api._actor_request_id(p_actor);
  v_read healthaccess.record_read_sessions%ROWTYPE;
BEGIN
  PERFORM healthaccess_api._require_channel('telecom');
  IF v_sid IS NULL OR NOT healthaccess_api._valid_digest(v_phone) THEN
    RETURN pg_catalog.jsonb_build_object('available', true);
  END IF;
  SELECT r.* INTO v_read
  FROM healthaccess.record_read_sessions r
  WHERE r.id = p_read_session_id
    AND r.telecom_session_id = v_sid
    AND r.phone_digest = v_phone
    AND r.channel = 'ussd'
    AND r.purpose = 'grant';
  IF FOUND THEN
    UPDATE healthaccess.record_read_sessions
    SET revoked_at = coalesce(revoked_at, pg_catalog.now())
    WHERE id = v_read.id;
    UPDATE telecom.ussd_sessions
    SET read_session_id = NULL, updated_at = pg_catalog.now(), version = version + 1
    WHERE id = v_sid AND phone_digest = v_phone;
    PERFORM healthaccess_api._audit_read('ussd', 'grant_close', v_read.patient_id, 'allowed', NULL, '[]'::jsonb, v_req, v_phone);
  END IF;
  RETURN pg_catalog.jsonb_build_object('available', true);
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.telecom_find_profile_consent(p_actor jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_phone text := healthaccess_api._actor_phone_digest(p_actor);
  v_req text := healthaccess_api._actor_request_id(p_actor);
  v_consent record;
BEGIN
  PERFORM healthaccess_api._require_channel('telecom');
  IF NOT healthaccess_api._valid_digest(v_phone) THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  SELECT c.id, c.patient_id, c.channel, c.expires_at INTO v_consent
  FROM healthaccess.profile_use_consents c
  JOIN telecom.channel_links l ON l.id = c.phone_link_id
  WHERE l.phone_digest = v_phone
    AND l.revoked_at IS NULL
    AND (l.expires_at IS NULL OR l.expires_at > pg_catalog.now())
    AND c.revoked_at IS NULL
    AND c.expires_at > pg_catalog.now()
  ORDER BY c.expires_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  PERFORM healthaccess_api._audit(
    v_req, NULL, v_consent.patient_id, v_consent.channel, 'profile_consent_lookup',
    'profile_consent', v_consent.id, 'allowed', NULL, ARRAY[]::text[], v_phone, '{}'::jsonb
  );
  RETURN pg_catalog.jsonb_build_object(
    'id', v_consent.id,
    'consent_id', v_consent.id,
    'channel', v_consent.channel,
    'expires_at', v_consent.expires_at
  );
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.telecom_read_profile_context(p_consent_id uuid, p_actor jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_phone text := healthaccess_api._actor_phone_digest(p_actor);
  v_req text := healthaccess_api._actor_request_id(p_actor);
  v_consent record;
  v_fields jsonb;
  v_channel text := 'sms';
BEGIN
  PERFORM healthaccess_api._require_channel('telecom');
  SELECT * INTO v_consent FROM healthaccess_api._consent_live(p_consent_id, v_phone) c;
  IF FOUND THEN
    v_channel := v_consent.channel;
  END IF;
  IF NOT FOUND THEN
    PERFORM healthaccess_api._audit_read(v_channel, 'profile_context_read', NULL, 'denied', 'consent_unavailable', '[]'::jsonb, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;
  v_fields := healthaccess_api._consent_projection(p_consent_id, v_consent.patient_id);
  IF pg_catalog.jsonb_array_length(v_fields) = 0 THEN
    PERFORM healthaccess_api._audit_read(v_channel, 'profile_context_read', v_consent.patient_id, 'denied', 'no_fields', v_fields, v_req, v_phone);
    RETURN healthaccess_api._denied();
  END IF;
  PERFORM healthaccess_api._audit_read(v_channel, 'profile_context_read', v_consent.patient_id, 'allowed', NULL, v_fields, v_req, v_phone);
  RETURN pg_catalog.jsonb_build_object('available', true, 'fields', v_fields, 'consent_id', p_consent_id);
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_read_emergency_summary(p_patient_code_digest text, p_actor jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ip text := healthaccess_api._actor_ip_hash(p_actor);
  v_req text := healthaccess_api._actor_request_id(p_actor);
  v_patient uuid;
  v_fields jsonb;
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  IF NOT healthaccess_api._valid_digest(p_patient_code_digest) THEN
    PERFORM healthaccess_api._attempt('web', 'emergency_lookup', 'denied', p_patient_code_digest, NULL, v_ip, v_req);
    PERFORM healthaccess_api._audit_read('web', 'emergency_lookup', NULL, 'denied', 'invalid_digest', '[]'::jsonb, v_req, v_ip);
    RETURN healthaccess_api._denied();
  END IF;
  IF healthaccess_api._too_many_attempts('web', 'emergency_lookup', p_patient_code_digest, NULL, v_ip, 20, 60) THEN
    PERFORM healthaccess_api._attempt('web', 'emergency_lookup', 'throttled', p_patient_code_digest, NULL, v_ip, v_req);
    PERFORM healthaccess_api._audit_read('web', 'emergency_lookup', NULL, 'denied', 'throttled', '[]'::jsonb, v_req, v_ip);
    RETURN healthaccess_api._denied();
  END IF;
  SELECT pc.patient_id INTO v_patient
  FROM healthaccess.patient_codes pc
  WHERE pc.code_digest = p_patient_code_digest;
  IF v_patient IS NULL THEN
    PERFORM healthaccess_api._attempt('web', 'emergency_lookup', 'denied', p_patient_code_digest, NULL, v_ip, v_req);
    PERFORM healthaccess_api._audit_read('web', 'emergency_lookup', NULL, 'denied', 'unknown_code', '[]'::jsonb, v_req, v_ip);
    RETURN healthaccess_api._denied();
  END IF;
  v_fields := healthaccess_api._emergency_projection(v_patient);
  IF pg_catalog.jsonb_array_length(v_fields) = 0 THEN
    PERFORM healthaccess_api._attempt('web', 'emergency_lookup', 'denied', p_patient_code_digest, NULL, v_ip, v_req);
    PERFORM healthaccess_api._audit_read('web', 'emergency_lookup', v_patient, 'denied', 'no_shared_fields', v_fields, v_req, v_ip);
    RETURN healthaccess_api._denied();
  END IF;
  PERFORM healthaccess_api._attempt('web', 'emergency_lookup', 'allowed', p_patient_code_digest, NULL, v_ip, v_req);
  PERFORM healthaccess_api._audit_read('web', 'emergency_lookup', v_patient, 'allowed', NULL, v_fields, v_req, v_ip);
  RETURN healthaccess_api._projection_read(v_fields, NULL);
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_open_granted_record(
  p_auth_session_digest text,
  p_patient_code_digest text,
  p_grant_code_digest text,
  p_actor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_auth uuid;
  v_patient uuid;
  v_ip text := healthaccess_api._actor_ip_hash(p_actor);
  v_req text := healthaccess_api._actor_request_id(p_actor);
  v_code_patient uuid;
  v_grant_id uuid;
  v_grant_exp timestamptz;
  v_fields jsonb;
  v_read_id uuid;
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  SELECT s.account_id, s.auth_session_id, s.patient_id INTO v_account, v_auth, v_patient
  FROM healthaccess_api._web_session(p_auth_session_digest) s;
  IF v_account IS NULL OR v_auth IS NULL THEN
    PERFORM healthaccess_api._audit_read('web', 'grant_open', NULL, 'denied', 'invalid_session', '[]'::jsonb, v_req, v_ip);
    RETURN healthaccess_api._denied();
  END IF;
  IF NOT healthaccess_api._practitioner_ok(v_account) THEN
    PERFORM healthaccess_api._audit_read('web', 'grant_open', v_patient, 'denied', 'not_approved_practitioner', '[]'::jsonb, v_req, v_ip);
    RETURN healthaccess_api._denied();
  END IF;
  IF NOT healthaccess_api._valid_digest(p_patient_code_digest)
    OR NOT healthaccess_api._valid_digest(p_grant_code_digest) THEN
    PERFORM healthaccess_api._attempt('web', 'grant_open', 'denied', p_grant_code_digest, NULL, v_ip, v_req);
    PERFORM healthaccess_api._audit_read('web', 'grant_open', v_patient, 'denied', 'invalid_digest', '[]'::jsonb, v_req, v_ip);
    RETURN healthaccess_api._denied();
  END IF;
  IF healthaccess_api._too_many_attempts('web', 'grant_open', p_grant_code_digest, NULL, v_ip, 5, 900) THEN
    PERFORM healthaccess_api._attempt('web', 'grant_open', 'throttled', p_grant_code_digest, NULL, v_ip, v_req);
    PERFORM healthaccess_api._audit_read('web', 'grant_open', v_patient, 'denied', 'throttled', '[]'::jsonb, v_req, v_ip);
    RETURN healthaccess_api._denied();
  END IF;

  SELECT pc.patient_id INTO v_code_patient
  FROM healthaccess.patient_codes pc
  WHERE pc.code_digest = p_patient_code_digest;
  IF v_code_patient IS NULL THEN
    PERFORM healthaccess_api._attempt('web', 'grant_open', 'denied', p_grant_code_digest, NULL, v_ip, v_req);
    PERFORM healthaccess_api._audit_read('web', 'grant_open', v_patient, 'denied', 'unknown_patient_code', '[]'::jsonb, v_req, v_ip);
    RETURN healthaccess_api._denied();
  END IF;

  SELECT g.id, g.expires_at INTO v_grant_id, v_grant_exp
  FROM healthaccess.access_grants g
  WHERE g.patient_id = v_code_patient
    AND g.code_digest = p_grant_code_digest
    AND g.revoked_at IS NULL
    AND g.expires_at > pg_catalog.now();
  IF v_grant_id IS NULL THEN
    PERFORM healthaccess_api._attempt('web', 'grant_open', 'denied', p_grant_code_digest, NULL, v_ip, v_req);
    PERFORM healthaccess_api._audit_read('web', 'grant_open', v_code_patient, 'denied', 'grant_unavailable', '[]'::jsonb, v_req, v_ip);
    RETURN healthaccess_api._denied();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM healthaccess.access_grant_channels c
    WHERE c.grant_id = v_grant_id AND c.channel = 'web_practitioner'
  ) THEN
    PERFORM healthaccess_api._attempt('web', 'grant_open', 'denied', p_grant_code_digest, NULL, v_ip, v_req);
    PERFORM healthaccess_api._audit_read('web', 'grant_open', v_code_patient, 'denied', 'wrong_channel', '[]'::jsonb, v_req, v_ip);
    RETURN healthaccess_api._denied();
  END IF;

  v_fields := healthaccess_api._grant_projection(v_grant_id, v_code_patient);
  IF pg_catalog.jsonb_array_length(v_fields) = 0 THEN
    PERFORM healthaccess_api._attempt('web', 'grant_open', 'denied', p_grant_code_digest, NULL, v_ip, v_req);
    PERFORM healthaccess_api._audit_read('web', 'grant_open', v_code_patient, 'denied', 'no_fields', v_fields, v_req, v_ip);
    RETURN healthaccess_api._denied();
  END IF;

  SELECT r.id INTO v_read_id
  FROM healthaccess.record_read_sessions r
  WHERE r.account_id = v_account
    AND r.auth_session_id = v_auth
    AND r.grant_id = v_grant_id
    AND r.purpose = 'grant'
    AND r.channel = 'web_practitioner'
    AND r.revoked_at IS NULL
    AND r.expires_at > pg_catalog.now()
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF v_read_id IS NULL THEN
    INSERT INTO healthaccess.record_read_sessions (
      patient_id, grant_id, purpose, channel, account_id, auth_session_id, expires_at
    ) VALUES (
      v_code_patient, v_grant_id, 'grant', 'web_practitioner', v_account, v_auth,
      least(pg_catalog.now() + interval '15 minutes', v_grant_exp)
    ) RETURNING id INTO v_read_id;
  ELSE
    UPDATE healthaccess.record_read_sessions SET last_read_at = pg_catalog.now() WHERE id = v_read_id;
  END IF;

  PERFORM healthaccess_api._attempt('web', 'grant_open', 'allowed', p_grant_code_digest, NULL, v_ip, v_req);
  PERFORM healthaccess_api._audit(
    v_req, v_account, v_code_patient, 'web', 'grant_open', 'access_grant', v_grant_id,
    'allowed', NULL, healthaccess_api._field_keys(v_fields), v_ip, '{}'::jsonb
  );
  RETURN healthaccess_api._projection_read(v_fields, v_read_id);
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_read_granted_record(
  p_auth_session_digest text,
  p_read_session_id uuid,
  p_actor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_auth uuid;
  v_patient uuid;
  v_ip text := healthaccess_api._actor_ip_hash(p_actor);
  v_req text := healthaccess_api._actor_request_id(p_actor);
  v_read healthaccess.record_read_sessions%ROWTYPE;
  v_grant_exp timestamptz;
  v_grant_revoked timestamptz;
  v_fields jsonb;
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  SELECT s.account_id, s.auth_session_id, s.patient_id INTO v_account, v_auth, v_patient
  FROM healthaccess_api._web_session(p_auth_session_digest) s;
  IF v_account IS NULL OR v_auth IS NULL THEN
    PERFORM healthaccess_api._audit_read('web', 'grant_read', NULL, 'denied', 'invalid_session', '[]'::jsonb, v_req, v_ip);
    RETURN healthaccess_api._denied();
  END IF;
  SELECT r.* INTO v_read
  FROM healthaccess.record_read_sessions r
  WHERE r.id = p_read_session_id
    AND r.account_id = v_account
    AND r.auth_session_id = v_auth
    AND r.channel = 'web_practitioner'
    AND r.purpose = 'grant'
    AND r.revoked_at IS NULL
    AND r.expires_at > pg_catalog.now();
  IF NOT FOUND THEN
    PERFORM healthaccess_api._audit_read('web', 'grant_read', v_patient, 'denied', 'read_session_unavailable', '[]'::jsonb, v_req, v_ip);
    RETURN healthaccess_api._denied();
  END IF;

  SELECT g.expires_at, g.revoked_at INTO v_grant_exp, v_grant_revoked
  FROM healthaccess.access_grants g
  WHERE g.id = v_read.grant_id AND g.patient_id = v_read.patient_id;
  IF v_grant_exp IS NULL OR v_grant_revoked IS NOT NULL OR v_grant_exp <= pg_catalog.now()
    OR NOT EXISTS (
      SELECT 1 FROM healthaccess.access_grant_channels c
      WHERE c.grant_id = v_read.grant_id AND c.channel = 'web_practitioner'
    ) THEN
    UPDATE healthaccess.record_read_sessions SET revoked_at = pg_catalog.now() WHERE id = v_read.id;
    PERFORM healthaccess_api._audit_read('web', 'grant_read', v_read.patient_id, 'denied', 'grant_unavailable', '[]'::jsonb, v_req, v_ip);
    RETURN healthaccess_api._denied();
  END IF;

  v_fields := healthaccess_api._grant_projection(v_read.grant_id, v_read.patient_id);
  IF pg_catalog.jsonb_array_length(v_fields) = 0 THEN
    PERFORM healthaccess_api._audit_read('web', 'grant_read', v_read.patient_id, 'denied', 'no_fields', v_fields, v_req, v_ip);
    RETURN healthaccess_api._denied();
  END IF;

  UPDATE healthaccess.record_read_sessions SET last_read_at = pg_catalog.now() WHERE id = v_read.id;
  PERFORM healthaccess_api._audit(
    v_req, v_account, v_read.patient_id, 'web', 'grant_read', 'access_grant', v_read.grant_id,
    'allowed', NULL, healthaccess_api._field_keys(v_fields), v_ip, '{}'::jsonb
  );
  RETURN healthaccess_api._projection_read(v_fields, v_read.id);
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_close_granted_record(
  p_auth_session_digest text,
  p_read_session_id uuid,
  p_actor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_auth uuid;
  v_patient uuid;
  v_req text := healthaccess_api._actor_request_id(p_actor);
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  SELECT s.account_id, s.auth_session_id, s.patient_id INTO v_account, v_auth, v_patient
  FROM healthaccess_api._web_session(p_auth_session_digest) s;
  IF v_account IS NULL OR v_auth IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('available', true);
  END IF;
  UPDATE healthaccess.record_read_sessions
  SET revoked_at = coalesce(revoked_at, pg_catalog.now())
  WHERE id = p_read_session_id
    AND account_id = v_account
    AND auth_session_id = v_auth
    AND channel = 'web_practitioner';
  PERFORM healthaccess_api._audit(
    v_req, v_account, v_patient, 'web', 'grant_close', 'access_grant', NULL,
    'allowed', NULL, ARRAY[]::text[], healthaccess_api._actor_ip_hash(p_actor), '{}'::jsonb
  );
  RETURN pg_catalog.jsonb_build_object('available', true);
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_get_my_profile(p_auth_session_digest text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_auth uuid;
  v_patient uuid;
  v_result jsonb;
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  SELECT s.account_id, s.auth_session_id, s.patient_id INTO v_account, v_auth, v_patient
  FROM healthaccess_api._web_session(p_auth_session_digest) s;
  IF v_account IS NULL OR v_patient IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'available', true,
    'account_id', p.account_id,
    'patient_id', p.id,
    'preferred_language', p.preferred_language,
    'home_area_id', p.home_area_id,
    'version', p.version,
    'fields', coalesce((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'key', pfv.field_key,
          'label', fd.label,
          'value', pfv.value,
          'version', pfv.version
        ) ORDER BY fd.sort_order, fd.field_key
      )
      FROM healthaccess.patient_field_values pfv
      JOIN healthaccess.field_definitions fd ON fd.field_key = pfv.field_key AND fd.active
      WHERE pfv.patient_id = p.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM healthaccess.patient_profiles p
  WHERE p.id = v_patient;
  RETURN coalesce(v_result, pg_catalog.jsonb_build_object('available', false));
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_save_profile_fields(
  p_auth_session_digest text,
  p_fields jsonb,
  p_expected_version integer,
  p_actor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_auth uuid;
  v_patient uuid;
  v_version integer;
  v_key text;
  v_value jsonb;
  v_req text := healthaccess_api._actor_request_id(p_actor);
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  SELECT s.account_id, s.auth_session_id, s.patient_id INTO v_account, v_auth, v_patient
  FROM healthaccess_api._web_session(p_auth_session_digest) s;
  IF v_account IS NULL OR v_patient IS NULL OR p_fields IS NULL OR pg_catalog.jsonb_typeof(p_fields) <> 'object' THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_each(p_fields) e
    WHERE NOT EXISTS (
      SELECT 1 FROM healthaccess.field_definitions fd
      WHERE fd.field_key = e.key AND fd.active
    )
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_each(p_fields) e
    WHERE pg_catalog.jsonb_typeof(e.value) = 'null'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;

  SELECT p.version INTO v_version
  FROM healthaccess.patient_profiles p
  WHERE p.id = v_patient
  FOR UPDATE;
  IF v_version IS NULL OR v_version <> p_expected_version THEN
    RETURN pg_catalog.jsonb_build_object('available', false, 'reason', 'version_conflict');
  END IF;

  FOR v_key, v_value IN SELECT e.key, e.value FROM pg_catalog.jsonb_each(p_fields) e LOOP
    INSERT INTO healthaccess.patient_field_values (
      patient_id, field_key, value, version, source, updated_by_account_id, updated_at
    ) VALUES (
      v_patient, v_key, v_value, 1, 'patient', v_account, pg_catalog.now()
    )
    ON CONFLICT (patient_id, field_key) DO UPDATE SET
      value = EXCLUDED.value,
      version = healthaccess.patient_field_values.version + 1,
      source = 'patient',
      updated_by_account_id = EXCLUDED.updated_by_account_id,
      updated_at = pg_catalog.now();
  END LOOP;

  UPDATE healthaccess.patient_profiles
  SET version = version + 1, updated_at = pg_catalog.now()
  WHERE id = v_patient
  RETURNING version INTO v_version;

  PERFORM healthaccess_api._audit(
    v_req, v_account, v_patient, 'web', 'profile_update', 'patient_profile', v_patient,
    'allowed', NULL, healthaccess_api._field_keys(
      (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('key', e.key)) FROM pg_catalog.jsonb_each(p_fields) e)
    ), healthaccess_api._actor_ip_hash(p_actor), '{}'::jsonb
  );
  RETURN pg_catalog.jsonb_build_object('available', true, 'version', v_version);
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_put_emergency_fields(
  p_auth_session_digest text,
  p_field_keys text[],
  p_expected_version integer,
  p_actor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_auth uuid;
  v_patient uuid;
  v_version integer;
  v_keys text[];
  v_key text;
  v_ord integer;
  v_req text := healthaccess_api._actor_request_id(p_actor);
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  SELECT s.account_id, s.auth_session_id, s.patient_id INTO v_account, v_auth, v_patient
  FROM healthaccess_api._web_session(p_auth_session_digest) s;
  IF v_account IS NULL OR v_patient IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  v_keys := coalesce(p_field_keys, ARRAY[]::text[]);
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(v_keys) k
    WHERE NOT EXISTS (
      SELECT 1
      FROM healthaccess.patient_field_values pfv
      JOIN healthaccess.field_definitions fd ON fd.field_key = pfv.field_key
      WHERE pfv.patient_id = v_patient AND pfv.field_key = k AND fd.emergency_eligible AND fd.active
    )
  ) THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  IF pg_catalog.cardinality(v_keys) <> (SELECT pg_catalog.count(DISTINCT k) FROM pg_catalog.unnest(v_keys) k) THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;

  SELECT p.version INTO v_version
  FROM healthaccess.patient_profiles p
  WHERE p.id = v_patient
  FOR UPDATE;
  IF v_version IS NULL OR v_version <> p_expected_version THEN
    RETURN pg_catalog.jsonb_build_object('available', false, 'reason', 'version_conflict');
  END IF;

  DELETE FROM healthaccess.emergency_fields ef WHERE ef.patient_id = v_patient;
  FOR v_key, v_ord IN
    SELECT x.key, x.ord FROM pg_catalog.unnest(v_keys) WITH ORDINALITY AS x(key, ord) ORDER BY x.ord
  LOOP
    INSERT INTO healthaccess.emergency_fields (patient_id, field_key, display_order)
    VALUES (v_patient, v_key, v_ord);
  END LOOP;

  UPDATE healthaccess.patient_profiles
  SET version = version + 1, updated_at = pg_catalog.now()
  WHERE id = v_patient
  RETURNING version INTO v_version;

  PERFORM healthaccess_api._audit(
    v_req, v_account, v_patient, 'web', 'emergency_fields_update', 'patient_profile', v_patient,
    'allowed', NULL, v_keys, healthaccess_api._actor_ip_hash(p_actor), '{}'::jsonb
  );
  RETURN pg_catalog.jsonb_build_object('available', true, 'version', v_version, 'field_keys', pg_catalog.to_jsonb(v_keys));
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_get_my_emergency_summary(p_auth_session_digest text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_auth uuid;
  v_patient uuid;
  v_version integer;
  v_fields jsonb;
  v_keys text[];
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  SELECT s.account_id, s.auth_session_id, s.patient_id INTO v_account, v_auth, v_patient
  FROM healthaccess_api._web_session(p_auth_session_digest) s;
  IF v_account IS NULL OR v_patient IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  SELECT p.version INTO v_version FROM healthaccess.patient_profiles p WHERE p.id = v_patient;
  v_fields := healthaccess_api._emergency_projection(v_patient);
  v_keys := healthaccess_api._field_keys(v_fields);
  RETURN pg_catalog.jsonb_build_object(
    'available', true,
    'version', v_version,
    'field_keys', pg_catalog.to_jsonb(v_keys),
    'fields', v_fields
  );
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_get_my_patient_code(p_auth_session_digest text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_auth uuid;
  v_patient uuid;
  v_code record;
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  SELECT s.account_id, s.auth_session_id, s.patient_id INTO v_account, v_auth, v_patient
  FROM healthaccess_api._web_session(p_auth_session_digest) s;
  IF v_account IS NULL OR v_patient IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  SELECT pc.code_ciphertext, pc.key_version, pc.code_version, pc.rotated_at INTO v_code
  FROM healthaccess.patient_codes pc WHERE pc.patient_id = v_patient;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'available', true,
    'code_envelope', v_code.code_ciphertext,
    'key_version', v_code.key_version,
    'code_version', v_code.code_version,
    'rotated_at', v_code.rotated_at
  );
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_rotate_patient_code(
  p_auth_session_digest text,
  p_new_code_digest text,
  p_new_code_envelope text,
  p_key_version integer,
  p_actor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_auth uuid;
  v_patient uuid;
  v_version integer;
  v_req text := healthaccess_api._actor_request_id(p_actor);
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  IF NOT healthaccess_api._web_recent_auth(p_auth_session_digest, 900)
    OR NOT healthaccess_api._valid_digest(p_new_code_digest)
    OR p_new_code_envelope IS NULL OR length(p_new_code_envelope) = 0
    OR p_key_version IS NULL OR p_key_version <= 0 THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  SELECT s.account_id, s.auth_session_id, s.patient_id INTO v_account, v_auth, v_patient
  FROM healthaccess_api._web_session(p_auth_session_digest) s;
  IF v_account IS NULL OR v_patient IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  UPDATE healthaccess.patient_codes
  SET code_digest = p_new_code_digest,
      code_ciphertext = p_new_code_envelope,
      key_version = p_key_version,
      code_version = code_version + 1,
      rotated_at = pg_catalog.now()
  WHERE patient_id = v_patient
  RETURNING code_version INTO v_version;
  IF v_version IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  UPDATE healthaccess.access_grants
  SET revoked_at = coalesce(revoked_at, pg_catalog.now()), updated_at = pg_catalog.now()
  WHERE patient_id = v_patient AND revoked_at IS NULL;
  UPDATE healthaccess.record_read_sessions
  SET revoked_at = coalesce(revoked_at, pg_catalog.now())
  WHERE patient_id = v_patient AND revoked_at IS NULL;
  PERFORM healthaccess_api._audit(
    v_req, v_account, v_patient, 'web', 'patient_code_rotate', 'patient_code', v_patient,
    'allowed', NULL, ARRAY[]::text[], healthaccess_api._actor_ip_hash(p_actor), '{}'::jsonb
  );
  RETURN pg_catalog.jsonb_build_object('available', true, 'code_version', v_version);
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_create_read_grant(
  p_auth_session_digest text,
  p_field_keys text[],
  p_channels text[],
  p_expires_in_seconds integer,
  p_access_code_digest text,
  p_actor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_auth uuid;
  v_patient uuid;
  v_keys text[];
  v_channels text[];
  v_grant_id uuid;
  v_expires timestamptz;
  v_req text := healthaccess_api._actor_request_id(p_actor);
  v_channel text;
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  IF NOT healthaccess_api._web_recent_auth(p_auth_session_digest, 900)
    OR NOT healthaccess_api._valid_digest(p_access_code_digest)
    OR p_expires_in_seconds IS NULL OR p_expires_in_seconds NOT BETWEEN 900 AND 86400 THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  SELECT s.account_id, s.auth_session_id, s.patient_id INTO v_account, v_auth, v_patient
  FROM healthaccess_api._web_session(p_auth_session_digest) s;
  IF v_account IS NULL OR v_patient IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  v_keys := ARRAY(SELECT DISTINCT k FROM pg_catalog.unnest(coalesce(p_field_keys, ARRAY[]::text[])) k ORDER BY k);
  v_channels := ARRAY(SELECT DISTINCT c FROM pg_catalog.unnest(coalesce(p_channels, ARRAY[]::text[])) c ORDER BY c);
  IF pg_catalog.cardinality(v_keys) = 0 OR pg_catalog.cardinality(v_channels) = 0 THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.unnest(v_channels) c WHERE c NOT IN ('web_practitioner', 'ussd')) THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(v_keys) k
    WHERE NOT EXISTS (
      SELECT 1
      FROM healthaccess.patient_field_values pfv
      JOIN healthaccess.field_definitions fd ON fd.field_key = pfv.field_key
      WHERE pfv.patient_id = v_patient AND pfv.field_key = k AND fd.active
    )
  ) THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;

  BEGIN
    INSERT INTO healthaccess.access_grants (
      patient_id, code_digest, expires_at, created_by_account_id
    ) VALUES (
      v_patient, p_access_code_digest, pg_catalog.now() + pg_catalog.make_interval(secs => p_expires_in_seconds), v_account
    ) RETURNING id, expires_at INTO v_grant_id, v_expires;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN pg_catalog.jsonb_build_object('available', false, 'reason', 'code_collision');
  END;

  INSERT INTO healthaccess.access_grant_fields (grant_id, field_key)
  SELECT v_grant_id, k FROM pg_catalog.unnest(v_keys) k;
  FOREACH v_channel IN ARRAY v_channels LOOP
    INSERT INTO healthaccess.access_grant_channels (grant_id, channel) VALUES (v_grant_id, v_channel);
  END LOOP;

  PERFORM healthaccess_api._audit(
    v_req, v_account, v_patient, 'web', 'grant_create', 'access_grant', v_grant_id,
    'allowed', NULL, v_keys, healthaccess_api._actor_ip_hash(p_actor), '{}'::jsonb
  );
  RETURN pg_catalog.jsonb_build_object(
    'available', true,
    'grant_id', v_grant_id,
    'expires_at', v_expires,
    'field_keys', pg_catalog.to_jsonb(v_keys),
    'channels', pg_catalog.to_jsonb(v_channels),
    'read_only', true
  );
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_revoke_read_grant(
  p_auth_session_digest text,
  p_grant_id uuid,
  p_actor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_auth uuid;
  v_patient uuid;
  v_req text := healthaccess_api._actor_request_id(p_actor);
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  SELECT s.account_id, s.auth_session_id, s.patient_id INTO v_account, v_auth, v_patient
  FROM healthaccess_api._web_session(p_auth_session_digest) s;
  IF v_account IS NULL OR v_patient IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  UPDATE healthaccess.access_grants
  SET revoked_at = coalesce(revoked_at, pg_catalog.now()), updated_at = pg_catalog.now(), version = version + 1
  WHERE id = p_grant_id AND patient_id = v_patient;
  UPDATE healthaccess.record_read_sessions
  SET revoked_at = coalesce(revoked_at, pg_catalog.now())
  WHERE grant_id = p_grant_id AND patient_id = v_patient AND revoked_at IS NULL;
  PERFORM healthaccess_api._audit(
    v_req, v_account, v_patient, 'web', 'grant_revoke', 'access_grant', p_grant_id,
    'allowed', NULL, ARRAY[]::text[], healthaccess_api._actor_ip_hash(p_actor), '{}'::jsonb
  );
  RETURN pg_catalog.jsonb_build_object('available', true);
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_list_my_grants(p_auth_session_digest text, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_auth uuid;
  v_patient uuid;
  v_result jsonb;
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  SELECT s.account_id, s.auth_session_id, s.patient_id INTO v_account, v_auth, v_patient
  FROM healthaccess_api._web_session(p_auth_session_digest) s;
  IF v_account IS NULL OR v_patient IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(g.obj ORDER BY g.created_at DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT gr.created_at, pg_catalog.jsonb_build_object(
      'grant_id', gr.id,
      'expires_at', gr.expires_at,
      'revoked_at', gr.revoked_at,
      'status', CASE WHEN gr.revoked_at IS NOT NULL THEN 'revoked' WHEN gr.expires_at <= pg_catalog.now() THEN 'expired' ELSE 'active' END,
      'field_keys', coalesce((SELECT pg_catalog.jsonb_agg(agf.field_key ORDER BY agf.field_key) FROM healthaccess.access_grant_fields agf WHERE agf.grant_id = gr.id), '[]'::jsonb),
      'channels', coalesce((SELECT pg_catalog.jsonb_agg(agc.channel ORDER BY agc.channel) FROM healthaccess.access_grant_channels agc WHERE agc.grant_id = gr.id), '[]'::jsonb)
    ) AS obj
    FROM healthaccess.access_grants gr
    WHERE gr.patient_id = v_patient
    ORDER BY gr.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 100))
  ) g;
  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_list_my_access_events(p_auth_session_digest text, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_auth uuid;
  v_patient uuid;
  v_result jsonb;
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  SELECT s.account_id, s.auth_session_id, s.patient_id INTO v_account, v_auth, v_patient
  FROM healthaccess_api._web_session(p_auth_session_digest) s;
  IF v_account IS NULL OR v_patient IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(e.obj ORDER BY e.occurred_at DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT a.occurred_at, pg_catalog.jsonb_build_object(
      'occurred_at', a.occurred_at,
      'channel', a.channel,
      'action', a.action,
      'outcome', a.outcome,
      'field_keys', pg_catalog.to_jsonb(a.field_keys)
    ) AS obj
    FROM healthaccess.audit_events a
    WHERE a.patient_id = v_patient
    ORDER BY a.occurred_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 100))
  ) e;
  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_put_channel_consent(
  p_auth_session_digest text,
  p_channel text,
  p_phone_link_id uuid,
  p_field_keys text[],
  p_expires_in_seconds integer,
  p_actor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_auth uuid;
  v_patient uuid;
  v_consent_id uuid;
  v_version integer;
  v_keys text[];
  v_key text;
  v_req text := healthaccess_api._actor_request_id(p_actor);
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  IF p_channel NOT IN ('sms', 'ussd')
    OR p_expires_in_seconds IS NULL OR p_expires_in_seconds NOT BETWEEN 900 AND 2592000 THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  SELECT s.account_id, s.auth_session_id, s.patient_id INTO v_account, v_auth, v_patient
  FROM healthaccess_api._web_session(p_auth_session_digest) s;
  IF v_account IS NULL OR v_patient IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM telecom.channel_links l
    WHERE l.id = p_phone_link_id
      AND l.patient_id = v_patient
      AND l.revoked_at IS NULL
      AND (l.expires_at IS NULL OR l.expires_at > pg_catalog.now())
  ) THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;

  v_keys := ARRAY(SELECT DISTINCT k FROM pg_catalog.unnest(coalesce(p_field_keys, ARRAY[]::text[])) k ORDER BY k);
  IF pg_catalog.cardinality(v_keys) = 0 THEN
    UPDATE healthaccess.profile_use_consents
    SET revoked_at = coalesce(revoked_at, pg_catalog.now()), updated_at = pg_catalog.now(), version = version + 1
    WHERE patient_id = v_patient AND channel = p_channel;
    PERFORM healthaccess_api._audit(
      v_req, v_account, v_patient, 'web', 'channel_consent_revoke', 'profile_consent', p_phone_link_id,
      'allowed', NULL, ARRAY[]::text[], healthaccess_api._actor_ip_hash(p_actor), '{}'::jsonb
    );
    RETURN pg_catalog.jsonb_build_object('available', true, 'revoked', true);
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(v_keys) k
    WHERE NOT EXISTS (
      SELECT 1 FROM healthaccess.patient_field_values pfv
      JOIN healthaccess.field_definitions fd ON fd.field_key = pfv.field_key
      WHERE pfv.patient_id = v_patient AND pfv.field_key = k AND fd.active
    )
  ) THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;

  INSERT INTO healthaccess.profile_use_consents (
    patient_id, channel, phone_link_id, expires_at, revoked_at, version
  ) VALUES (
    v_patient, p_channel, p_phone_link_id,
    pg_catalog.now() + pg_catalog.make_interval(secs => p_expires_in_seconds), NULL, 1
  )
  ON CONFLICT (patient_id, channel) DO UPDATE SET
    phone_link_id = EXCLUDED.phone_link_id,
    expires_at = EXCLUDED.expires_at,
    revoked_at = NULL,
    version = healthaccess.profile_use_consents.version + 1,
    updated_at = pg_catalog.now()
  RETURNING id, version INTO v_consent_id, v_version;

  DELETE FROM healthaccess.consent_fields cf WHERE cf.consent_id = v_consent_id;
  FOREACH v_key IN ARRAY v_keys LOOP
    INSERT INTO healthaccess.consent_fields (consent_id, field_key) VALUES (v_consent_id, v_key);
  END LOOP;

  PERFORM healthaccess_api._audit(
    v_req, v_account, v_patient, 'web', 'channel_consent_put', 'profile_consent', v_consent_id,
    'allowed', NULL, v_keys, healthaccess_api._actor_ip_hash(p_actor), '{}'::jsonb
  );
  RETURN pg_catalog.jsonb_build_object(
    'available', true,
    'consent_id', v_consent_id,
    'version', v_version,
    'field_keys', pg_catalog.to_jsonb(v_keys)
  );
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_delete_channel_consent(
  p_auth_session_digest text,
  p_channel text,
  p_actor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_auth uuid;
  v_patient uuid;
  v_req text := healthaccess_api._actor_request_id(p_actor);
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  IF p_channel NOT IN ('sms', 'ussd') THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  SELECT s.account_id, s.auth_session_id, s.patient_id INTO v_account, v_auth, v_patient
  FROM healthaccess_api._web_session(p_auth_session_digest) s;
  IF v_account IS NULL OR v_patient IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  UPDATE healthaccess.profile_use_consents
  SET revoked_at = coalesce(revoked_at, pg_catalog.now()), updated_at = pg_catalog.now(), version = version + 1
  WHERE patient_id = v_patient AND channel = p_channel;
  PERFORM healthaccess_api._audit(
    v_req, v_account, v_patient, 'web', 'channel_consent_revoke', 'profile_consent', NULL,
    'allowed', NULL, ARRAY[]::text[], healthaccess_api._actor_ip_hash(p_actor), '{}'::jsonb
  );
  RETURN pg_catalog.jsonb_build_object('available', true);
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_begin_phone_verification(
  p_auth_session_digest text,
  p_phone_envelope text,
  p_phone_digest text,
  p_code_digest text,
  p_actor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_auth uuid;
  v_patient uuid;
  v_challenge_id uuid;
  v_req text := healthaccess_api._actor_request_id(p_actor);
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  IF p_phone_envelope IS NULL OR length(p_phone_envelope) = 0
    OR NOT healthaccess_api._valid_digest(p_phone_digest)
    OR NOT healthaccess_api._valid_digest(p_code_digest) THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  SELECT s.account_id, s.auth_session_id, s.patient_id INTO v_account, v_auth, v_patient
  FROM healthaccess_api._web_session(p_auth_session_digest) s;
  IF v_account IS NULL OR v_patient IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  INSERT INTO healthaccess.auth_challenges (
    account_id, purpose, token_digest, delivery_target_envelope, phone_digest, expires_at
  ) VALUES (
    v_account, 'phone_verification', p_code_digest, p_phone_envelope, p_phone_digest,
    now() + interval '10 minutes'
  ) RETURNING id INTO v_challenge_id;
  PERFORM healthaccess_api._audit(
    v_req, v_account, v_patient, 'web', 'phone_verification_begin', 'auth_challenge', v_challenge_id,
    'allowed', NULL, ARRAY[]::text[], healthaccess_api._actor_ip_hash(p_actor), '{}'::jsonb
  );
  RETURN pg_catalog.jsonb_build_object('available', true, 'challenge_id', v_challenge_id, 'expires_at', pg_catalog.now() + interval '10 minutes');
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.web_confirm_phone_verification(
  p_auth_session_digest text,
  p_challenge_id uuid,
  p_code_digest text,
  p_actor jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_auth uuid;
  v_patient uuid;
  v_challenge record;
  v_phone_digest text;
  v_link_id uuid;
  v_req text := healthaccess_api._actor_request_id(p_actor);
BEGIN
  PERFORM healthaccess_api._require_channel('web');
  SELECT s.account_id, s.auth_session_id, s.patient_id INTO v_account, v_auth, v_patient
  FROM healthaccess_api._web_session(p_auth_session_digest) s;
  IF v_account IS NULL OR v_patient IS NULL OR NOT healthaccess_api._valid_digest(p_code_digest) THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  SELECT id, token_digest, delivery_target_envelope, phone_digest, attempts INTO v_challenge
  FROM healthaccess.auth_challenges
  WHERE id = p_challenge_id
    AND account_id = v_account
    AND purpose = 'phone_verification'
    AND consumed_at IS NULL
    AND attempts < 5
    AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;
  IF v_challenge.token_digest <> p_code_digest THEN
    UPDATE healthaccess.auth_challenges
    SET attempts = attempts + 1
    WHERE id = p_challenge_id;
    RETURN pg_catalog.jsonb_build_object('available', false);
  END IF;

  UPDATE healthaccess.auth_challenges
  SET consumed_at = pg_catalog.now(), attempts = attempts + 1
  WHERE id = p_challenge_id;

  v_phone_digest := v_challenge.phone_digest;
  INSERT INTO telecom.channel_links (
    patient_id, phone_envelope, phone_digest, verified_at, revoked_at, version
  ) VALUES (
    v_patient, v_challenge.delivery_target_envelope, v_phone_digest, pg_catalog.now(), NULL, 1
  )
  ON CONFLICT (patient_id, phone_digest) WHERE revoked_at IS NULL DO UPDATE SET
    phone_envelope = EXCLUDED.phone_envelope,
    verified_at = pg_catalog.now(),
    expires_at = NULL,
    updated_at = pg_catalog.now(),
    version = telecom.channel_links.version + 1
  RETURNING id INTO v_link_id;

  PERFORM healthaccess_api._audit(
    v_req, v_account, v_patient, 'web', 'phone_verification_confirm', 'channel_link', v_link_id,
    'allowed', NULL, ARRAY[]::text[], healthaccess_api._actor_ip_hash(p_actor), '{}'::jsonb
  );
  RETURN pg_catalog.jsonb_build_object('available', true, 'phone_link_id', v_link_id);
END
$$;

CREATE OR REPLACE FUNCTION healthaccess_api.find_reviewed_content(p_query text, p_limit integer DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_channel text := healthaccess_api._channel();
  v_query text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_query, '')));
  v_result jsonb;
BEGIN
  IF v_channel NOT IN ('web', 'telecom') THEN
    RAISE EXCEPTION 'healthaccess channel denied' USING ERRCODE = '42501';
  END IF;
  IF v_query = '' THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(row_data ORDER BY topic, version DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT c.topic_code AS topic, c.version, pg_catalog.jsonb_build_object(
      'id', c.id,
      'topic', c.topic_code,
      'language', c.language,
      'version', c.version,
      'body', c.body,
      'reviewer', a.display_name,
      'reviewed_at', c.reviewed_at
    ) AS row_data
    FROM content.reviewed_health_content c
    JOIN healthaccess.accounts a ON a.id = c.reviewer_account_id
    WHERE c.status = 'published'
      AND c.reviewed_at IS NOT NULL
      AND (
        pg_catalog.lower(c.topic_code) LIKE '%' || v_query || '%'
        OR pg_catalog.lower(c.title) LIKE '%' || v_query || '%'
        OR pg_catalog.lower(c.body) LIKE '%' || v_query || '%'
      )
    ORDER BY c.topic_code, c.version DESC
    LIMIT greatest(1, least(coalesce(p_limit, 3), 5))
  ) found;
  RETURN v_result;
END
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA healthaccess_api FROM PUBLIC;

GRANT USAGE ON SCHEMA healthaccess_api TO healthaccess_web, healthaccess_telecom;
GRANT USAGE ON SCHEMA telecom TO healthaccess_telecom;

GRANT SELECT, INSERT, UPDATE, DELETE ON telecom.sms_inbox, telecom.sms_conversations, telecom.ussd_sessions,
  telecom.outbox, telecom.delivery_events, telecom.channel_preferences, telecom.rate_limits
  TO healthaccess_telecom;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA telecom TO healthaccess_telecom;

GRANT EXECUTE ON FUNCTION healthaccess_api.list_services() TO healthaccess_web, healthaccess_telecom;
GRANT EXECUTE ON FUNCTION healthaccess_api.find_areas(text, integer) TO healthaccess_web, healthaccess_telecom;
GRANT EXECUTE ON FUNCTION healthaccess_api.find_facilities(text, uuid, numeric, integer) TO healthaccess_web, healthaccess_telecom;
GRANT EXECUTE ON FUNCTION healthaccess_api.get_facility(uuid) TO healthaccess_web, healthaccess_telecom;
GRANT EXECUTE ON FUNCTION healthaccess_api.find_reviewed_content(text, integer) TO healthaccess_web, healthaccess_telecom;

GRANT EXECUTE ON FUNCTION healthaccess_api.get_web_lead(uuid) TO healthaccess_telecom;
GRANT EXECUTE ON FUNCTION healthaccess_api.sms_store_web_leads(jsonb, jsonb) TO healthaccess_telecom;
GRANT EXECUTE ON FUNCTION healthaccess_api.telecom_record_referral(text, uuid, uuid[], uuid, jsonb) TO healthaccess_telecom;
GRANT EXECUTE ON FUNCTION healthaccess_api.sms_read_emergency_summary(text, jsonb) TO healthaccess_telecom;
GRANT EXECUTE ON FUNCTION healthaccess_api.ussd_read_emergency_summary(text, jsonb) TO healthaccess_telecom;
GRANT EXECUTE ON FUNCTION healthaccess_api.ussd_open_granted_record(text, text, jsonb) TO healthaccess_telecom;
GRANT EXECUTE ON FUNCTION healthaccess_api.ussd_read_granted_record(uuid, jsonb) TO healthaccess_telecom;
GRANT EXECUTE ON FUNCTION healthaccess_api.ussd_close_granted_record(uuid, jsonb) TO healthaccess_telecom;
GRANT EXECUTE ON FUNCTION healthaccess_api.telecom_find_profile_consent(jsonb) TO healthaccess_telecom;
GRANT EXECUTE ON FUNCTION healthaccess_api.telecom_read_profile_context(uuid, jsonb) TO healthaccess_telecom;

GRANT EXECUTE ON FUNCTION healthaccess_api.web_read_emergency_summary(text, jsonb) TO healthaccess_web;
GRANT EXECUTE ON FUNCTION healthaccess_api.web_open_granted_record(text, text, text, jsonb) TO healthaccess_web;
GRANT EXECUTE ON FUNCTION healthaccess_api.web_read_granted_record(text, uuid, jsonb) TO healthaccess_web;
GRANT EXECUTE ON FUNCTION healthaccess_api.web_close_granted_record(text, uuid, jsonb) TO healthaccess_web;
GRANT EXECUTE ON FUNCTION healthaccess_api.web_get_my_profile(text) TO healthaccess_web;
GRANT EXECUTE ON FUNCTION healthaccess_api.web_save_profile_fields(text, jsonb, integer, jsonb) TO healthaccess_web;
GRANT EXECUTE ON FUNCTION healthaccess_api.web_put_emergency_fields(text, text[], integer, jsonb) TO healthaccess_web;
GRANT EXECUTE ON FUNCTION healthaccess_api.web_get_my_emergency_summary(text) TO healthaccess_web;
GRANT EXECUTE ON FUNCTION healthaccess_api.web_get_my_patient_code(text) TO healthaccess_web;
GRANT EXECUTE ON FUNCTION healthaccess_api.web_rotate_patient_code(text, text, text, integer, jsonb) TO healthaccess_web;
GRANT EXECUTE ON FUNCTION healthaccess_api.web_create_read_grant(text, text[], text[], integer, text, jsonb) TO healthaccess_web;
GRANT EXECUTE ON FUNCTION healthaccess_api.web_revoke_read_grant(text, uuid, jsonb) TO healthaccess_web;
GRANT EXECUTE ON FUNCTION healthaccess_api.web_list_my_grants(text, integer) TO healthaccess_web;
GRANT EXECUTE ON FUNCTION healthaccess_api.web_list_my_access_events(text, integer) TO healthaccess_web;
GRANT EXECUTE ON FUNCTION healthaccess_api.web_put_channel_consent(text, text, uuid, text[], integer, jsonb) TO healthaccess_web;
GRANT EXECUTE ON FUNCTION healthaccess_api.web_delete_channel_consent(text, text, jsonb) TO healthaccess_web;
GRANT EXECUTE ON FUNCTION healthaccess_api.web_begin_phone_verification(text, text, text, text, jsonb) TO healthaccess_web;
GRANT EXECUTE ON FUNCTION healthaccess_api.web_confirm_phone_verification(text, uuid, text, jsonb) TO healthaccess_web;

RESET ROLE;
COMMIT;
