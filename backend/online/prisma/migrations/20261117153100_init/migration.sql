-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING');

-- CreateEnum
CREATE TYPE "AccountRoleType" AS ENUM ('PATIENT', 'PRACTITIONER', 'DIRECTORY_ADMIN', 'ACCOUNT_ADMIN');

-- CreateEnum
CREATE TYPE "AuthChallengePurpose" AS ENUM ('PASSWORD_RESET', 'PHONE_VERIFICATION', 'PATIENT_CODE_ROTATE');

-- CreateEnum
CREATE TYPE "FieldValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'OBJECT', 'STRING_ARRAY');

-- CreateEnum
CREATE TYPE "FieldSource" AS ENUM ('PATIENT', 'PRACTITIONER', 'IMPORT');

-- CreateEnum
CREATE TYPE "GrantChannel" AS ENUM ('WEB_PRACTITIONER', 'USSD');

-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('SMS', 'USSD');

-- CreateEnum
CREATE TYPE "ReadPurpose" AS ENUM ('EMERGENCY', 'GRANT');

-- CreateEnum
CREATE TYPE "ReadChannel" AS ENUM ('WEB_PRACTITIONER', 'USSD');

-- CreateEnum
CREATE TYPE "AuditChannel" AS ENUM ('WEB', 'SMS', 'USSD', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('ALLOWED', 'DENIED', 'ERROR');

-- CreateEnum
CREATE TYPE "AttemptChannel" AS ENUM ('WEB', 'SMS', 'USSD');

-- CreateEnum
CREATE TYPE "AttemptOutcome" AS ENUM ('ALLOWED', 'DENIED', 'THROTTLED');

-- CreateEnum
CREATE TYPE "UssdState" AS ENUM ('MAIN', 'CARE_SERVICE', 'CARE_LOCATION', 'CARE_AREA_CHOICE', 'CARE_PROFILE_CONFIRM', 'CARE_RESULTS', 'CARE_NO_MATCH', 'EMERGENCY_CODE', 'GRANT_PATIENT_CODE', 'GRANT_ACCESS_CODE', 'RECORD_PAGE', 'END');

-- CreateEnum
CREATE TYPE "InboxStatus" AS ENUM ('QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OutboxKind" AS ENUM ('TEXT', 'EMERGENCY', 'FACILITY', 'WEB_LEAD');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('QUEUED', 'SENDING', 'ACCEPTED', 'DELIVERED', 'FAILED', 'UNKNOWN', 'EXPIRED', 'DEAD');

-- CreateEnum
CREATE TYPE "FacilityStatus" AS ENUM ('PENDING', 'APPROVED', 'INACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "FacilityServiceVerification" AS ENUM ('UNVERIFIED', 'APPROVED');

-- CreateEnum
CREATE TYPE "PractitionerVerification" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('MANUAL', 'OFFICIAL_REGISTER', 'PROVIDER_API', 'SERPER_WEB', 'SEED');

-- CreateEnum
CREATE TYPE "TrustTier" AS ENUM ('OFFICIAL', 'APPROVED', 'MANUAL', 'UNVERIFIED_WEB');

-- CreateEnum
CREATE TYPE "WebLeadStatus" AS ENUM ('UNVERIFIED', 'REVIEW_CANDIDATE', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'REVIEWED', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ObservationStatus" AS ENUM ('UNVERIFIED', 'REVIEW_CANDIDATE', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('MILD', 'MODERATE', 'SEVERE');

-- CreateEnum
CREATE TYPE "MedicationStatus" AS ENUM ('PENDING', 'TAKEN', 'MISSED');

-- CreateEnum
CREATE TYPE "NotificationPlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "idp_subject" TEXT,
    "avatar_key" TEXT,
    "email_verified_at" TIMESTAMPTZ(6),
    "phone_digest" VARCHAR(64),
    "phone_verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_roles" (
    "account_id" UUID NOT NULL,
    "role" "AccountRoleType" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_roles_pkey" PRIMARY KEY ("account_id","role")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(64) NOT NULL,
    "user_agent" TEXT,
    "ip_hash" TEXT,
    "recent_auth_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID,
    "purpose" "AuthChallengePurpose" NOT NULL,
    "token_digest" VARCHAR(64) NOT NULL,
    "delivery_target_envelope" TEXT,
    "phone_digest" VARCHAR(64),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_definitions" (
    "field_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value_schema" JSONB NOT NULL DEFAULT '{}',
    "value_type" "FieldValueType" NOT NULL,
    "emergency_eligible" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "field_definitions_pkey" PRIMARY KEY ("field_key")
);

-- CreateTable
CREATE TABLE "patient_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "preferred_language" TEXT NOT NULL DEFAULT 'en',
    "home_area_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patient_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practitioner_profiles" (
    "account_id" UUID NOT NULL,
    "facility_id" UUID,
    "registration_reference_envelope" TEXT,
    "verification_status" "PractitionerVerification" NOT NULL DEFAULT 'PENDING',
    "verified_by_account_id" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "practitioner_profiles_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "patient_field_values" (
    "patient_id" UUID NOT NULL,
    "field_key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "source" "FieldSource" NOT NULL DEFAULT 'PATIENT',
    "updated_by_account_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patient_field_values_pkey" PRIMARY KEY ("patient_id","field_key")
);

-- CreateTable
CREATE TABLE "emergency_fields" (
    "patient_id" UUID NOT NULL,
    "field_key" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_fields_pkey" PRIMARY KEY ("patient_id","field_key")
);

-- CreateTable
CREATE TABLE "patient_codes" (
    "patient_id" UUID NOT NULL,
    "code_digest" VARCHAR(64) NOT NULL,
    "code_ciphertext" TEXT NOT NULL,
    "key_version" INTEGER NOT NULL,
    "code_version" INTEGER NOT NULL DEFAULT 1,
    "rotated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_codes_pkey" PRIMARY KEY ("patient_id")
);

-- CreateTable
CREATE TABLE "access_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "code_digest" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_by_account_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_grant_fields" (
    "grant_id" UUID NOT NULL,
    "field_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_grant_fields_pkey" PRIMARY KEY ("grant_id","field_key")
);

-- CreateTable
CREATE TABLE "access_grant_channels" (
    "grant_id" UUID NOT NULL,
    "channel" "GrantChannel" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_grant_channels_pkey" PRIMARY KEY ("grant_id","channel")
);

-- CreateTable
CREATE TABLE "profile_use_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "phone_link_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "profile_use_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_fields" (
    "consent_id" UUID NOT NULL,
    "field_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_fields_pkey" PRIMARY KEY ("consent_id","field_key")
);

-- CreateTable
CREATE TABLE "channel_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "phone_envelope" TEXT NOT NULL,
    "phone_digest" VARCHAR(64) NOT NULL,
    "verified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "channel_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_read_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "grant_id" UUID,
    "purpose" "ReadPurpose" NOT NULL,
    "channel" "ReadChannel" NOT NULL,
    "account_id" UUID,
    "auth_session_id" UUID,
    "telecom_session_id" UUID,
    "phone_digest" VARCHAR(64),
    "code_version" INTEGER,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "last_read_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_read_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_preferences" (
    "phone_digest" VARCHAR(64) NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "opted_out" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "channel_preferences_pkey" PRIMARY KEY ("phone_digest")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "scope" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("scope","window_start")
);

-- CreateTable
CREATE TABLE "ussd_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL DEFAULT 'africastalking',
    "provider_session_id" TEXT,
    "phone_digest" VARCHAR(64) NOT NULL,
    "service_code" TEXT,
    "state" "UssdState" NOT NULL DEFAULT 'MAIN',
    "context" JSONB NOT NULL DEFAULT '{}',
    "path_digest" VARCHAR(64),
    "path_depth" INTEGER NOT NULL DEFAULT -1,
    "invalid_attempts" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "read_session_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ussd_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_inbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL DEFAULT 'africastalking',
    "provider_message_id" TEXT NOT NULL,
    "phone_digest" VARCHAR(64) NOT NULL,
    "body_envelope" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "InboxStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_until" TIMESTAMPTZ(6),
    "claimed_by" TEXT,
    "last_error_code" TEXT,
    "processed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now() + interval '7 days',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sms_inbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone_digest" VARCHAR(64) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'idle',
    "context" JSONB NOT NULL DEFAULT '{}',
    "last_input_digest" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sms_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "logical_key" TEXT NOT NULL,
    "kind" "OutboxKind" NOT NULL,
    "recipient_phone_envelope" TEXT NOT NULL,
    "recipient_phone_digest" VARCHAR(64),
    "render_ref" JSONB NOT NULL DEFAULT '{}',
    "payload_envelope" TEXT,
    "read_session_id" UUID,
    "status" "OutboxStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_until" TIMESTAMPTZ(6),
    "claimed_by" TEXT,
    "provider_message_id" TEXT,
    "last_error_code" TEXT,
    "accepted_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now() + interval '1 day',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_events" (
    "id" BIGSERIAL NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'africastalking',
    "provider_message_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "event_fingerprint" VARCHAR(64) NOT NULL,
    "outbox_id" UUID,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" TEXT NOT NULL DEFAULT '',
    "actor_account_id" UUID,
    "patient_id" UUID,
    "channel" "AuditChannel" NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" UUID,
    "outcome" "AuditOutcome" NOT NULL,
    "reason_code" TEXT,
    "field_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actor_ref" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_attempts" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" "AttemptChannel" NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" "AttemptOutcome" NOT NULL,
    "target_digest" VARCHAR(64),
    "phone_digest" VARCHAR(64),
    "ip_hash" TEXT,
    "request_id" TEXT NOT NULL DEFAULT '',
    "expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now() + interval '30 days',

    CONSTRAINT "access_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "actor_scope" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_digest" TEXT,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID,
    "response_envelope" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now() + interval '1 day',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("actor_scope","idempotency_key")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_account_id" UUID,
    "anonymous_session_digest" VARCHAR(64),
    "channel" TEXT NOT NULL DEFAULT 'web',
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content_envelope" TEXT NOT NULL,
    "ui_payload" JSONB NOT NULL DEFAULT '[]',
    "model_version" TEXT,
    "reviewed_content_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country_code" VARCHAR(2) NOT NULL DEFAULT 'NG',
    "region" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "center_latitude" DECIMAL(8,6),
    "center_longitude" DECIMAL(9,6),
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "area_aliases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "area_id" UUID NOT NULL,
    "alias_normalized" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "area_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "service_code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("service_code")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_kind" "SourceKind" NOT NULL,
    "publisher" TEXT,
    "canonical_url" TEXT,
    "retrieved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "query_text" TEXT,
    "content_sha256" VARCHAR(64),
    "trust_tier" "TrustTier" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "area_id" UUID NOT NULL,
    "latitude" DECIMAL(8,6),
    "longitude" DECIMAL(9,6),
    "phone" TEXT,
    "status" "FacilityStatus" NOT NULL DEFAULT 'PENDING',
    "source_id" UUID,
    "last_verified_at" TIMESTAMPTZ(6),
    "verified_by_account_id" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_services" (
    "facility_id" UUID NOT NULL,
    "service_code" TEXT NOT NULL,
    "verification_status" "FacilityServiceVerification" NOT NULL DEFAULT 'UNVERIFIED',
    "source_id" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "verified_by_account_id" UUID,
    "availability_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "facility_services_pkey" PRIMARY KEY ("facility_id","service_code")
);

-- CreateTable
CREATE TABLE "web_leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "source_url" TEXT NOT NULL,
    "snippet" TEXT,
    "observed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "WebLeadStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "content_fingerprint" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID,
    "conversation_id" UUID,
    "channel" TEXT NOT NULL,
    "service_code" TEXT NOT NULL,
    "area_id" UUID,
    "requested_latitude" DECIMAL(8,6),
    "requested_longitude" DECIMAL(9,6),
    "radius_km" DECIMAL(6,2) NOT NULL DEFAULT 25,
    "status" TEXT NOT NULL,
    "applied_consent_id" UUID,
    "applied_field_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "request_id" TEXT NOT NULL DEFAULT '',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "referral_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_results" (
    "referral_id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "distance_km" DECIMAL(8,3),
    "distance_basis" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "facility_snapshot" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_results_pkey" PRIMARY KEY ("referral_id","facility_id")
);

-- CreateTable
CREATE TABLE "reviewed_health_content" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "topic_code" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewer_account_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reviewed_health_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviewed_content_citations" (
    "content_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "citation_label" TEXT NOT NULL,
    "locator" TEXT,
    "supports_claim" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviewed_content_citations_pkey" PRIMARY KEY ("content_id","source_id","citation_label")
);

-- CreateTable
CREATE TABLE "web_observations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_id" UUID NOT NULL,
    "query_text" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "snippet" TEXT,
    "content_fingerprint" VARCHAR(64) NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ObservationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "reviewer_account_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "symptom_analyses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" TEXT,
    "severity" "Severity",
    "summary" TEXT,
    "include_records" BOOLEAN NOT NULL DEFAULT true,
    "modify_history" BOOLEAN NOT NULL DEFAULT true,
    "files" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thread_id" TEXT,
    "model_version" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "symptom_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allergies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'MILD',
    "diagnosis_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "allergies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "recovery_time" TEXT,
    "occurred_on" DATE,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "medical_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "medications" JSONB NOT NULL DEFAULT '[]',
    "start_date" DATE,
    "end_date" DATE,
    "summary" TEXT NOT NULL,
    "progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "score" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "medication_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_moments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "medication_schedule_id" UUID NOT NULL,
    "drug" TEXT,
    "dose" TEXT,
    "frequency" TEXT,
    "status" "MedicationStatus" NOT NULL DEFAULT 'PENDING',
    "time" TIMESTAMPTZ(6) NOT NULL,
    "notified_user" BOOLEAN NOT NULL DEFAULT false,
    "notified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_moments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "NotificationPlatform" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_idp_subject_key" ON "accounts"("idp_subject");

-- CreateIndex
CREATE INDEX "accounts_email_idx" ON "accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_account_id_expires_at_idx" ON "auth_sessions"("account_id", "expires_at" DESC);

-- CreateIndex
CREATE INDEX "auth_challenges_account_id_purpose_expires_at_idx" ON "auth_challenges"("account_id", "purpose", "expires_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "patient_profiles_account_id_key" ON "patient_profiles"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_codes_code_digest_key" ON "patient_codes"("code_digest");

-- CreateIndex
CREATE INDEX "access_grants_patient_id_expires_at_idx" ON "access_grants"("patient_id", "expires_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "access_grants_patient_id_code_digest_key" ON "access_grants"("patient_id", "code_digest");

-- CreateIndex
CREATE UNIQUE INDEX "profile_use_consents_patient_id_channel_key" ON "profile_use_consents"("patient_id", "channel");

-- CreateIndex
CREATE INDEX "channel_links_patient_id_phone_digest_idx" ON "channel_links"("patient_id", "phone_digest");

-- CreateIndex
CREATE INDEX "channel_links_phone_digest_idx" ON "channel_links"("phone_digest");

-- CreateIndex
CREATE INDEX "record_read_sessions_telecom_session_id_expires_at_idx" ON "record_read_sessions"("telecom_session_id", "expires_at" DESC);

-- CreateIndex
CREATE INDEX "record_read_sessions_account_id_auth_session_id_expires_at_idx" ON "record_read_sessions"("account_id", "auth_session_id", "expires_at" DESC);

-- CreateIndex
CREATE INDEX "ussd_sessions_phone_digest_expires_at_idx" ON "ussd_sessions"("phone_digest", "expires_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ussd_sessions_provider_provider_session_id_key" ON "ussd_sessions"("provider", "provider_session_id");

-- CreateIndex
CREATE INDEX "sms_inbox_status_next_attempt_at_lease_until_idx" ON "sms_inbox"("status", "next_attempt_at", "lease_until");

-- CreateIndex
CREATE UNIQUE INDEX "sms_inbox_provider_provider_message_id_key" ON "sms_inbox"("provider", "provider_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "sms_conversations_phone_digest_key" ON "sms_conversations"("phone_digest");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_logical_key_key" ON "outbox"("logical_key");

-- CreateIndex
CREATE INDEX "outbox_status_next_attempt_at_lease_until_idx" ON "outbox"("status", "next_attempt_at", "lease_until");

-- CreateIndex
CREATE INDEX "outbox_read_session_id_idx" ON "outbox"("read_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_events_event_fingerprint_key" ON "delivery_events"("event_fingerprint");

-- CreateIndex
CREATE INDEX "delivery_events_provider_provider_message_id_received_at_idx" ON "delivery_events"("provider", "provider_message_id", "received_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_patient_id_occurred_at_idx" ON "audit_events"("patient_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX "access_attempts_action_target_digest_occurred_at_idx" ON "access_attempts"("action", "target_digest", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "access_attempts_action_phone_digest_occurred_at_idx" ON "access_attempts"("action", "phone_digest", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "conversations_owner_account_id_updated_at_idx" ON "conversations"("owner_account_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "conversation_messages_conversation_id_created_at_idx" ON "conversation_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "areas_name_city_region_idx" ON "areas"("name", "city", "region");

-- CreateIndex
CREATE INDEX "area_aliases_alias_normalized_idx" ON "area_aliases"("alias_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "area_aliases_area_id_alias_normalized_key" ON "area_aliases"("area_id", "alias_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "sources_canonical_url_key" ON "sources"("canonical_url");

-- CreateIndex
CREATE INDEX "facilities_area_id_status_idx" ON "facilities"("area_id", "status");

-- CreateIndex
CREATE INDEX "facility_services_service_code_facility_id_idx" ON "facility_services"("service_code", "facility_id");

-- CreateIndex
CREATE INDEX "web_leads_observed_at_status_idx" ON "web_leads"("observed_at" DESC, "status");

-- CreateIndex
CREATE UNIQUE INDEX "web_leads_source_url_content_fingerprint_key" ON "web_leads"("source_url", "content_fingerprint");

-- CreateIndex
CREATE INDEX "referral_requests_patient_id_requested_at_idx" ON "referral_requests"("patient_id", "requested_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "referral_results_referral_id_rank_key" ON "referral_results"("referral_id", "rank");

-- CreateIndex
CREATE INDEX "reviewed_health_content_status_topic_code_idx" ON "reviewed_health_content"("status", "topic_code");

-- CreateIndex
CREATE UNIQUE INDEX "reviewed_health_content_topic_code_language_version_key" ON "reviewed_health_content"("topic_code", "language", "version");

-- CreateIndex
CREATE UNIQUE INDEX "web_observations_source_id_content_fingerprint_key" ON "web_observations"("source_id", "content_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "symptom_analyses_thread_id_key" ON "symptom_analyses"("thread_id");

-- CreateIndex
CREATE INDEX "symptom_analyses_patient_id_created_at_idx" ON "symptom_analyses"("patient_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "allergies_patient_id_idx" ON "allergies"("patient_id");

-- CreateIndex
CREATE INDEX "medical_events_patient_id_idx" ON "medical_events"("patient_id");

-- CreateIndex
CREATE INDEX "medication_schedules_patient_id_created_at_idx" ON "medication_schedules"("patient_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "medication_moments_time_status_idx" ON "medication_moments"("time", "status");

-- CreateIndex
CREATE INDEX "medication_moments_medication_schedule_id_idx" ON "medication_moments"("medication_schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_tokens_token_key" ON "notification_tokens"("token");

-- CreateIndex
CREATE INDEX "notification_tokens_account_id_idx" ON "notification_tokens"("account_id");

-- AddForeignKey
ALTER TABLE "account_roles" ADD CONSTRAINT "account_roles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_home_area_id_fkey" FOREIGN KEY ("home_area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_profiles" ADD CONSTRAINT "practitioner_profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_profiles" ADD CONSTRAINT "practitioner_profiles_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_profiles" ADD CONSTRAINT "practitioner_profiles_verified_by_account_id_fkey" FOREIGN KEY ("verified_by_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_field_values" ADD CONSTRAINT "patient_field_values_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_field_values" ADD CONSTRAINT "patient_field_values_field_key_fkey" FOREIGN KEY ("field_key") REFERENCES "field_definitions"("field_key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_field_values" ADD CONSTRAINT "patient_field_values_updated_by_account_id_fkey" FOREIGN KEY ("updated_by_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_fields" ADD CONSTRAINT "emergency_fields_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_fields" ADD CONSTRAINT "emergency_fields_field_key_fkey" FOREIGN KEY ("field_key") REFERENCES "field_definitions"("field_key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_fields" ADD CONSTRAINT "emergency_fields_patient_id_field_key_fkey" FOREIGN KEY ("patient_id", "field_key") REFERENCES "patient_field_values"("patient_id", "field_key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_codes" ADD CONSTRAINT "patient_codes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_created_by_account_id_fkey" FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant_fields" ADD CONSTRAINT "access_grant_fields_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "access_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant_fields" ADD CONSTRAINT "access_grant_fields_field_key_fkey" FOREIGN KEY ("field_key") REFERENCES "field_definitions"("field_key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant_channels" ADD CONSTRAINT "access_grant_channels_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "access_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_use_consents" ADD CONSTRAINT "profile_use_consents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_use_consents" ADD CONSTRAINT "profile_use_consents_phone_link_id_fkey" FOREIGN KEY ("phone_link_id") REFERENCES "channel_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_fields" ADD CONSTRAINT "consent_fields_consent_id_fkey" FOREIGN KEY ("consent_id") REFERENCES "profile_use_consents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_fields" ADD CONSTRAINT "consent_fields_field_key_fkey" FOREIGN KEY ("field_key") REFERENCES "field_definitions"("field_key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_links" ADD CONSTRAINT "channel_links_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_read_sessions" ADD CONSTRAINT "record_read_sessions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_read_sessions" ADD CONSTRAINT "record_read_sessions_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "access_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_read_sessions" ADD CONSTRAINT "record_read_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_read_sessions" ADD CONSTRAINT "record_read_sessions_auth_session_id_fkey" FOREIGN KEY ("auth_session_id") REFERENCES "auth_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_read_sessions" ADD CONSTRAINT "record_read_sessions_telecom_session_id_fkey" FOREIGN KEY ("telecom_session_id") REFERENCES "ussd_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_read_session_id_fkey" FOREIGN KEY ("read_session_id") REFERENCES "record_read_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_outbox_id_fkey" FOREIGN KEY ("outbox_id") REFERENCES "outbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_account_id_fkey" FOREIGN KEY ("owner_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_aliases" ADD CONSTRAINT "area_aliases_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_verified_by_account_id_fkey" FOREIGN KEY ("verified_by_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_services" ADD CONSTRAINT "facility_services_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_services" ADD CONSTRAINT "facility_services_service_code_fkey" FOREIGN KEY ("service_code") REFERENCES "services"("service_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_services" ADD CONSTRAINT "facility_services_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_services" ADD CONSTRAINT "facility_services_verified_by_account_id_fkey" FOREIGN KEY ("verified_by_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_leads" ADD CONSTRAINT "web_leads_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_requests" ADD CONSTRAINT "referral_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_requests" ADD CONSTRAINT "referral_requests_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_requests" ADD CONSTRAINT "referral_requests_service_code_fkey" FOREIGN KEY ("service_code") REFERENCES "services"("service_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_requests" ADD CONSTRAINT "referral_requests_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_requests" ADD CONSTRAINT "referral_requests_applied_consent_id_fkey" FOREIGN KEY ("applied_consent_id") REFERENCES "profile_use_consents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_results" ADD CONSTRAINT "referral_results_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referral_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_results" ADD CONSTRAINT "referral_results_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviewed_health_content" ADD CONSTRAINT "reviewed_health_content_reviewer_account_id_fkey" FOREIGN KEY ("reviewer_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviewed_content_citations" ADD CONSTRAINT "reviewed_content_citations_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "reviewed_health_content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviewed_content_citations" ADD CONSTRAINT "reviewed_content_citations_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_observations" ADD CONSTRAINT "web_observations_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_observations" ADD CONSTRAINT "web_observations_reviewer_account_id_fkey" FOREIGN KEY ("reviewer_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symptom_analyses" ADD CONSTRAINT "symptom_analyses_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symptom_analyses" ADD CONSTRAINT "symptom_analyses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allergies" ADD CONSTRAINT "allergies_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_events" ADD CONSTRAINT "medical_events_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_schedules" ADD CONSTRAINT "medication_schedules_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_moments" ADD CONSTRAINT "medication_moments_medication_schedule_id_fkey" FOREIGN KEY ("medication_schedule_id") REFERENCES "medication_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_tokens" ADD CONSTRAINT "notification_tokens_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
