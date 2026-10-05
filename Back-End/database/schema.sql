-- Cardiology Screening System - Updated Schema
-- PostgreSQL-compatible SQL

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users table (simplified for compatibility)
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    email VARCHAR(120) NOT NULL UNIQUE,
    role VARCHAR(24) NOT NULL DEFAULT 'clinician',
    password_hash TEXT NOT NULL,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_role_check CHECK (role IN ('admin', 'doctor', 'clinician', 'auditor'))
);

-- Sessions table for auth
CREATE TABLE IF NOT EXISTS sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Patients table
CREATE TABLE IF NOT EXISTS patients (
    id BIGSERIAL PRIMARY KEY,
    external_patient_code VARCHAR(64),
    sex VARCHAR(16),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT patients_sex_check CHECK (sex IS NULL OR sex IN ('male', 'female', 'other'))
);

-- Patient sensitive data (encrypted)
CREATE TABLE IF NOT EXISTS patient_sensitive_data (
    id BIGSERIAL PRIMARY KEY,
    patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    date_of_birth DATE,
    phone VARCHAR(32),
    email VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auditing
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    action_type VARCHAR(32) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id BIGINT,
    patient_id BIGINT REFERENCES patients(id) ON DELETE SET NULL,
    encounter_id BIGINT,
    assessment_id BIGINT,
    http_method VARCHAR(8),
    endpoint VARCHAR(255),
    outcome VARCHAR(24) NOT NULL DEFAULT 'success',
    ip_address INET,
    user_agent TEXT,
    before_data JSONB,
    after_data JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT audit_log_action_check CHECK (action_type IN ('create', 'read', 'update', 'delete', 'login', 'logout', 'export', 'print', 'share')),
    CONSTRAINT audit_log_outcome_check CHECK (outcome IN ('success', 'failure', 'denied'))
);

-- Encounters
CREATE TABLE IF NOT EXISTS encounters (
    id BIGSERIAL PRIMARY KEY,
    patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    encounter_type VARCHAR(32) NOT NULL DEFAULT 'outpatient',
    status VARCHAR(24) NOT NULL DEFAULT 'completed',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Flexible feature storage
CREATE TABLE IF NOT EXISTS encounter_features (
    id BIGSERIAL PRIMARY KEY,
    encounter_id BIGINT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    feature_name VARCHAR(64) NOT NULL,
    feature_value TEXT,
    value_type VARCHAR(16) NOT NULL DEFAULT 'string',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(encounter_id, feature_name),
    CONSTRAINT encounter_features_value_type_check CHECK (value_type IN ('string', 'number', 'boolean', 'date', 'json'))
);

-- Model registry
CREATE TABLE IF NOT EXISTS model_registry (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    version VARCHAR(40) NOT NULL,
    model_type VARCHAR(40) NOT NULL DEFAULT 'logistic_regression',
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    algorithm VARCHAR(40),
    use_case VARCHAR(120) DEFAULT 'cardiovascular_disease_risk',
    accuracy NUMERIC(6,4),
    auc NUMERIC(6,4),
    precision_score NUMERIC(6,4),
    recall_score NUMERIC(6,4),
    f1_score NUMERIC(6,4),
    training_data_size INTEGER,
    validation_metrics JSONB,
    artifact_uri TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(name, version)
);

-- Model features
CREATE TABLE IF NOT EXISTS model_features (
    id BIGSERIAL PRIMARY KEY,
    model_id BIGINT NOT NULL REFERENCES model_registry(id) ON DELETE CASCADE,
    feature_name VARCHAR(64) NOT NULL,
    feature_type VARCHAR(16),
    description TEXT,
    importance_score NUMERIC(6,4),
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(model_id, feature_name)
);

-- Risk assessments
CREATE TABLE IF NOT EXISTS risk_assessments (
    id BIGSERIAL PRIMARY KEY,
    patient_id BIGINT NOT NULL REFERENCES patients(id),
    model_id BIGINT REFERENCES model_registry(id),
    encounter_id BIGINT REFERENCES encounters(id),
    probability NUMERIC(6,5) NOT NULL,
    risk_level VARCHAR(16) NOT NULL,
    assessment_status VARCHAR(16) NOT NULL DEFAULT 'completed',
    review_status VARCHAR(16) NOT NULL DEFAULT 'pending',
    recommendation TEXT,
    notes TEXT,
    explanation_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT risk_assessments_level_check CHECK (risk_level IN ('low', 'medium', 'high')),
    CONSTRAINT risk_assessments_review_check CHECK (review_status IN ('pending', 'reviewed')),
    CONSTRAINT risk_assessments_status_check CHECK (assessment_status IN ('pending', 'completed', 'failed'))
);

-- Assessment feature values
CREATE TABLE IF NOT EXISTS assessment_feature_values (
    id BIGSERIAL PRIMARY KEY,
    assessment_id BIGINT NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
    feature_name VARCHAR(64) NOT NULL,
    feature_value TEXT,
    value_type VARCHAR(16) NOT NULL DEFAULT 'string',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(assessment_id, feature_name)
);

-- CDS Rules
CREATE TABLE IF NOT EXISTS cds_rules (
    id BIGSERIAL PRIMARY KEY,
    risk_level VARCHAR(16) NOT NULL,
    min_probability NUMERIC(7,6) NOT NULL,
    max_probability NUMERIC(7,6) NOT NULL,
    recommendation TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cds_rules_probability_check CHECK (min_probability >= 0 AND max_probability <= 1 AND min_probability <= max_probability)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_encounters_patient_id ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_features_encounter_id ON encounter_features(encounter_id);
CREATE INDEX IF NOT EXISTS idx_features_feature_name ON encounter_features(feature_name);
CREATE INDEX IF NOT EXISTS idx_assessments_patient_id ON risk_assessments(patient_id);
CREATE INDEX IF NOT EXISTS idx_assessments_model_id ON risk_assessments(model_id);
CREATE INDEX IF NOT EXISTS idx_assessments_created_at ON risk_assessments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assessments_risk_level ON risk_assessments(risk_level);
CREATE INDEX IF NOT EXISTS idx_audit_log_patient_id ON audit_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_features_model_id ON model_features(model_id);
CREATE INDEX IF NOT EXISTS idx_assessment_features_assessment_id ON assessment_feature_values(assessment_id);

-- Functions
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_patient_sensitive_data_updated_at
    BEFORE UPDATE ON patient_sensitive_data
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- Optional bootstrap data should be applied separately via migration or seed scripts.
