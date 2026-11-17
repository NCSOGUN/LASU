-- AlterTable
ALTER TABLE "access_attempts" ALTER COLUMN "expires_at" SET DEFAULT now() + interval '30 days';

-- AlterTable
ALTER TABLE "idempotency_records" ALTER COLUMN "expires_at" SET DEFAULT now() + interval '1 day';

-- AlterTable
ALTER TABLE "outbox" ALTER COLUMN "expires_at" SET DEFAULT now() + interval '1 day';

-- AlterTable
ALTER TABLE "sms_inbox" ALTER COLUMN "expires_at" SET DEFAULT now() + interval '7 days';

-- ---------------------------------------------------------------------------
-- Invariants Prisma cannot express.
-- Every constraint/index is added idempotently so the migration can be re-run
-- against a database that was repaired by hand.
-- ---------------------------------------------------------------------------

-- patient_profiles: version is a monotonic optimistic-lock counter.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_profiles_version_positive'
      AND conrelid = 'patient_profiles'::regclass
  ) THEN
    ALTER TABLE "patient_profiles"
      ADD CONSTRAINT "patient_profiles_version_positive" CHECK ("version" > 0);
  END IF;
END $$;

-- patient_field_values: JSON null is not a value; bound the projected payload.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_field_values_value_valid'
      AND conrelid = 'patient_field_values'::regclass
  ) THEN
    ALTER TABLE "patient_field_values"
      ADD CONSTRAINT "patient_field_values_value_valid"
      CHECK ("value" <> 'null'::jsonb AND octet_length("value"::text) <= 65536);
  END IF;
END $$;

-- access_grants: a grant must expire after it was created.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'access_grants_expiry_after_creation'
      AND conrelid = 'access_grants'::regclass
  ) THEN
    ALTER TABLE "access_grants"
      ADD CONSTRAINT "access_grants_expiry_after_creation" CHECK ("expires_at" > "created_at");
  END IF;
END $$;

-- facility_services: an approved service has been verified.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'facility_services_approved_verified'
      AND conrelid = 'facility_services'::regclass
  ) THEN
    ALTER TABLE "facility_services"
      ADD CONSTRAINT "facility_services_approved_verified"
      CHECK ("verification_status" <> 'APPROVED' OR "verified_at" IS NOT NULL);
  END IF;
END $$;

-- reviewed_health_content: reviewed/published content has a reviewer and timestamp.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reviewed_health_content_review_required'
      AND conrelid = 'reviewed_health_content'::regclass
  ) THEN
    ALTER TABLE "reviewed_health_content"
      ADD CONSTRAINT "reviewed_health_content_review_required"
      CHECK (
        "status" NOT IN ('REVIEWED', 'PUBLISHED')
        OR ("reviewer_account_id" IS NOT NULL AND "reviewed_at" IS NOT NULL)
      );
  END IF;
END $$;

-- ussd_sessions: state machine bounds.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ussd_sessions_bounds'
      AND conrelid = 'ussd_sessions'::regclass
  ) THEN
    ALTER TABLE "ussd_sessions"
      ADD CONSTRAINT "ussd_sessions_bounds"
      CHECK ("path_depth" >= -1 AND "invalid_attempts" >= 0);
  END IF;
END $$;

-- sms_inbox: retry counter never goes negative.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sms_inbox_attempts_nonnegative'
      AND conrelid = 'sms_inbox'::regclass
  ) THEN
    ALTER TABLE "sms_inbox"
      ADD CONSTRAINT "sms_inbox_attempts_nonnegative" CHECK ("attempts" >= 0);
  END IF;
END $$;

-- outbox: retry counter never goes negative.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'outbox_attempts_nonnegative'
      AND conrelid = 'outbox'::regclass
  ) THEN
    ALTER TABLE "outbox"
      ADD CONSTRAINT "outbox_attempts_nonnegative" CHECK ("attempts" >= 0);
  END IF;
END $$;

-- delivery_events: provider status is a short opaque token.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'delivery_events_status_length'
      AND conrelid = 'delivery_events'::regclass
  ) THEN
    ALTER TABLE "delivery_events"
      ADD CONSTRAINT "delivery_events_status_length"
      CHECK (length("status") BETWEEN 1 AND 40);
  END IF;
END $$;

-- record_read_sessions: channel shape must match the read channel.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'record_read_sessions_channel_shape'
      AND conrelid = 'record_read_sessions'::regclass
  ) THEN
    ALTER TABLE "record_read_sessions"
      ADD CONSTRAINT "record_read_sessions_channel_shape"
      CHECK (
        (
          "channel" = 'WEB_PRACTITIONER'
          AND "account_id" IS NOT NULL
          AND "auth_session_id" IS NOT NULL
          AND "telecom_session_id" IS NULL
          AND "phone_digest" IS NULL
        )
        OR
        (
          "channel" = 'USSD'
          AND "account_id" IS NULL
          AND "auth_session_id" IS NULL
          AND "telecom_session_id" IS NOT NULL
          AND "phone_digest" IS NOT NULL
        )
      );
  END IF;
END $$;

-- record_read_sessions: emergency reads have no grant; grant reads have exactly one.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'record_read_sessions_purpose_shape'
      AND conrelid = 'record_read_sessions'::regclass
  ) THEN
    ALTER TABLE "record_read_sessions"
      ADD CONSTRAINT "record_read_sessions_purpose_shape"
      CHECK (
        (
          "purpose" = 'EMERGENCY'
          AND "grant_id" IS NULL
          AND "code_version" IS NOT NULL
        )
        OR
        (
          "purpose" = 'GRANT'
          AND "grant_id" IS NOT NULL
          AND "code_version" IS NULL
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- One live channel link per patient phone; revoked links are kept for history.
CREATE UNIQUE INDEX IF NOT EXISTS "channel_links_active_phone_key"
  ON "channel_links" ("patient_id", "phone_digest")
  WHERE "revoked_at" IS NULL;

CREATE INDEX IF NOT EXISTS "channel_links_active_phone_digest_idx"
  ON "channel_links" ("phone_digest")
  WHERE "revoked_at" IS NULL;

-- Case-insensitive directory lookup used by area search.
CREATE INDEX IF NOT EXISTS "areas_lookup_idx"
  ON "areas" (lower("name"), lower("city"), lower("region"))
  WHERE "active";

-- "area_aliases" ("alias_normalized") is already indexed by Prisma as
-- "area_aliases_alias_normalized_idx" in the init migration; no duplicate here.

-- Only approved facility services are advertised.
CREATE INDEX IF NOT EXISTS "facility_services_approved_idx"
  ON "facility_services" ("service_code", "facility_id")
  WHERE "verification_status" = 'APPROVED';

-- Live read sessions only; revoked rows are history and must not crowd the scan.
CREATE INDEX IF NOT EXISTS "record_read_sessions_telecom_active_idx"
  ON "record_read_sessions" ("telecom_session_id", "expires_at" DESC)
  WHERE "revoked_at" IS NULL;

CREATE INDEX IF NOT EXISTS "record_read_sessions_web_active_idx"
  ON "record_read_sessions" ("account_id", "auth_session_id", "expires_at" DESC)
  WHERE "revoked_at" IS NULL;

-- Legacy indexes already covered by Prisma in the init migration (do not
-- duplicate): audit_events(patient_id, occurred_at DESC),
-- audit_events(occurred_at DESC), referral_requests(patient_id, requested_at
-- DESC), outbox(status, next_attempt_at, lease_until), outbox(read_session_id),
-- sms_inbox(status, next_attempt_at, lease_until),
-- delivery_events(provider, provider_message_id, received_at DESC),
-- ussd_sessions(phone_digest, expires_at DESC).
