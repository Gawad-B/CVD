-- Demo sandboxes, clinical additions (heart rate, clinician override) and audit-preserving FKs.
-- Idempotent: safe to re-run.

-- Demo accounts
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_ip INET;
CREATE INDEX IF NOT EXISTS idx_users_demo_created_ip ON users(created_ip, created_at) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_users_demo_expires_at ON users(demo_expires_at) WHERE is_demo;

-- Sandbox ownership: NULL = real clinic data; a demo user id = that demo's private data.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_patients_owner_user_id ON patients(owner_user_id);

-- Assessment additions
ALTER TABLE risk_assessments ADD COLUMN IF NOT EXISTS heart_rate_bpm SMALLINT;
ALTER TABLE risk_assessments ADD COLUMN IF NOT EXISTS override_risk_level VARCHAR(16);
ALTER TABLE risk_assessments ADD COLUMN IF NOT EXISTS override_recommendation TEXT;
ALTER TABLE risk_assessments ADD COLUMN IF NOT EXISTS override_reason TEXT;
ALTER TABLE risk_assessments ADD COLUMN IF NOT EXISTS overridden_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE risk_assessments ADD COLUMN IF NOT EXISTS overridden_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'risk_assessments_override_level_check') THEN
        ALTER TABLE risk_assessments ADD CONSTRAINT risk_assessments_override_level_check
            CHECK (override_risk_level IS NULL OR override_risk_level IN ('low', 'medium', 'high'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'risk_assessments_heart_rate_check') THEN
        ALTER TABLE risk_assessments ADD CONSTRAINT risk_assessments_heart_rate_check
            CHECK (heart_rate_bpm IS NULL OR heart_rate_bpm BETWEEN 30 AND 220);
    END IF;
END $$;

-- Deleting a user (demo purge) must keep audit and assessment history: references to the
-- user become NULL instead of blocking the delete. Re-pointing is skipped once applied.
DO $$
DECLARE
    fk RECORD;
BEGIN
    FOR fk IN
        SELECT * FROM (VALUES
            ('audit_log', 'user_id', 'audit_log_user_id_fkey'),
            ('risk_assessments', 'reviewed_by', 'risk_assessments_reviewed_by_fkey'),
            ('risk_assessments', 'deleted_by', 'risk_assessments_deleted_by_fkey'),
            ('risk_assessments', 'overridden_by', 'risk_assessments_overridden_by_fkey')
        ) AS t(tbl, col, conname)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = fk.conname AND conrelid = fk.tbl::regclass AND confdeltype = 'n'
        ) THEN
            EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', fk.tbl, fk.conname);
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES users(id) ON DELETE SET NULL',
                fk.tbl, fk.conname, fk.col
            );
        END IF;
    END LOOP;
END $$;
