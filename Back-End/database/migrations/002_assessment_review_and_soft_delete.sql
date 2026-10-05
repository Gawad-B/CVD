ALTER TABLE risk_assessments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE risk_assessments ADD COLUMN IF NOT EXISTS deleted_by BIGINT REFERENCES users(id);
ALTER TABLE risk_assessments ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id);
ALTER TABLE risk_assessments ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE risk_assessments ADD COLUMN IF NOT EXISTS review_comment TEXT;

CREATE INDEX IF NOT EXISTS idx_assessments_not_deleted
    ON risk_assessments(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
