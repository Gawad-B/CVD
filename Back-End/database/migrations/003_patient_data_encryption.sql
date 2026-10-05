-- Encrypted storage for patient identifiers. Values are AES-256-GCM ciphertext produced by the
-- application (Back-End/phi_crypto.py), so the key never reaches the database.
-- Plaintext columns stay for not-yet-migrated rows; scripts/encrypt_patient_data.py moves them.
-- (The pgcrypto extension from schema.sql is no longer used for this, but is left in place.)
ALTER TABLE patient_sensitive_data
    ADD COLUMN IF NOT EXISTS first_name_enc BYTEA,
    ADD COLUMN IF NOT EXISTS last_name_enc BYTEA,
    ADD COLUMN IF NOT EXISTS date_of_birth_enc BYTEA,
    ADD COLUMN IF NOT EXISTS phone_enc BYTEA,
    ADD COLUMN IF NOT EXISTS email_enc BYTEA;
