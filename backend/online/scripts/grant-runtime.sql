-- Runtime role grants for the online and offline services.
-- Idempotent (GRANT is repeatable). Run as the schema owner or a superuser after
-- migrations, e.g. `psql "$DATABASE_URL_ADMIN" -f scripts/grant-runtime.sql`.
-- This script never creates roles or passwords.

GRANT USAGE ON SCHEMA public TO healthaccess_offline;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO healthaccess_offline;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO healthaccess_offline;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO healthaccess_offline;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO healthaccess_offline;

-- Cover objects created later by the database owner role, when it exists and
-- the current user may manage its default privileges.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'healthaccess_owner') THEN
    BEGIN
      EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE healthaccess_owner IN SCHEMA public '
        || 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO healthaccess_offline';
      EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE healthaccess_owner IN SCHEMA public '
        || 'GRANT USAGE, SELECT ON SEQUENCES TO healthaccess_offline';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping healthaccess_owner default privileges: insufficient privilege';
    END;
  END IF;
END $$;

-- Online runtime role is optional in environments that only run the offline worker.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'healthaccess_online') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO healthaccess_online';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO healthaccess_online';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO healthaccess_online';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
      || 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO healthaccess_online';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
      || 'GRANT USAGE, SELECT ON SEQUENCES TO healthaccess_online';
  ELSE
    RAISE NOTICE 'healthaccess_online role does not exist; skipping grants';
  END IF;
END $$;

-- LangGraph agent memory. Create the schema and run the checkpointer setup once
-- with an administrator connection; the runtime role only gets DML. The AI layer
-- skips setup when ai_agent_state.checkpoint_migrations already exists.
CREATE SCHEMA IF NOT EXISTS ai_agent_state;

GRANT USAGE, CREATE ON SCHEMA ai_agent_state TO healthaccess_offline;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ai_agent_state TO healthaccess_offline;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ai_agent_state TO healthaccess_offline;
ALTER DEFAULT PRIVILEGES IN SCHEMA ai_agent_state
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO healthaccess_offline;
ALTER DEFAULT PRIVILEGES IN SCHEMA ai_agent_state
  GRANT USAGE, SELECT ON SEQUENCES TO healthaccess_offline;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'healthaccess_online') THEN
    EXECUTE 'GRANT USAGE, CREATE ON SCHEMA ai_agent_state TO healthaccess_online';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ai_agent_state TO healthaccess_online';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ai_agent_state TO healthaccess_online';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA ai_agent_state '
      || 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO healthaccess_online';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA ai_agent_state '
      || 'GRANT USAGE, SELECT ON SEQUENCES TO healthaccess_online';
  END IF;
END $$;
