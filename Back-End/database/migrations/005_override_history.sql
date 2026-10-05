-- Append-only history of clinician overrides (one row per override request). Idempotent.
CREATE TABLE IF NOT EXISTS risk_assessment_overrides (
    id BIGSERIAL PRIMARY KEY,
    assessment_id BIGINT NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
    risk_level VARCHAR(16),
    recommendation TEXT,
    reason TEXT NOT NULL,
    overridden_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_risk_assessment_overrides_assessment_id ON risk_assessment_overrides(assessment_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'risk_assessment_overrides_level_check') THEN
        ALTER TABLE risk_assessment_overrides ADD CONSTRAINT risk_assessment_overrides_level_check
            CHECK (risk_level IS NULL OR risk_level IN ('low', 'medium', 'high'));
    END IF;
END $$;
