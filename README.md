# Cardiology Screening System

A comprehensive web application for cardiology patient screening and risk assessment, featuring patient management, encounter tracking, and ML-powered risk prediction.

## Overview

The system consists of:
- **Front-End**: React SPA with Vite, providing UI for patient management, encounter creation, and risk assessments
- **Back-End**: FastAPI REST API with PostgreSQL database, handling patient data, ML inference, and audit logging
- **Database**: PostgreSQL with comprehensive schema for patient records, encounters, assessments, and audit trails

## Tech Stack

### Front-End
- React 18+ with TypeScript
- Vite for bundling and development
- React Router for navigation
- Context API for state management

### Back-End
- FastAPI (Python)
- PostgreSQL database with psycopg2
- Session-token authentication (hashed tokens in the `sessions` table)
- Audit logging system

## Project Structure

```
Cardiology Screening System/
├── Front-End/              # React application
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/       # API client layer, types
│   │   │   ├── components/ # Pages and feature components
│   │   │   ├── landing/    # Public landing page
│   │   │   ├── heart/      # 3D heart, ECG strip
│   │   │   ├── ui/         # Shared UI primitives
│   │   │   ├── context/    # Auth context
│   │   │   └── routes.tsx  # Router configuration
│   │   ├── main.tsx        # React entry point
│   │   ├── App.tsx         # App wrapper
│   │   └── index.css       # Global styles
│   ├── package.json
│   └── vite.config.ts
├── Back-End/               # FastAPI application
│   ├── app.py              # Main API server
│   ├── phi_crypto.py       # Application-level AES-256-GCM for patient identifiers
│   ├── requirements.txt    # Runtime dependencies
│   ├── requirements-dev.txt # Test dependencies (pytest, httpx)
│   ├── ml/                 # features.py, train.py, inference.py, explain.py
│   ├── model/              # cvd_nhanes_v2.ipynb, cvd_pipeline.joblib, feature_schema.json, metrics_ml.json, NHANES dataset
│   ├── scripts/            # migrate.py, seed_admin.py, encrypt_patient_data.py, purge_expired_demos.py, test_db.sh
│   ├── tests/              # pytest suite
│   └── database/
│       ├── schema.sql      # Base database schema
│       └── migrations/     # Idempotent NNN_*.sql migrations
├── Assets/                 # Project resources
├── .gitignore             # Git ignore rules
└── README.md              # This file
```

## User Interface

Public landing page (`/`) and a signed-in app shell. The shell has a top tab bar (Dashboard, Patients, Assessments, plus Models, Users and Audit log for the roles allowed to see them), a notification bell with the count of assessments pending review, and the user menu.

- **Landing page:** hero with a "Try a demo" call to action, how it works, model facts, care-team roles and security. Model numbers (accuracy, ROC AUC, recall, precision, feature importances) come from `Back-End/model/metrics_ml.json` and the tree models' importances, copied into the front-end.
- **Dashboard:** a 3D heart whose colour and beat follow the effective risk level, an ECG strip, patient list with selection, vitals, the model contributions, sign-off, and clinician override. The heart rate is optional and is **not a model input**: a measured value is shown as "Measured"; without one the animation uses an illustrative rate for the risk level and is labelled as such.
- **Patients:** list, search, add patient (date of birth, sex, contact), patient details with their assessments.
- **Assessments:** past results and a new-assessment form (required inputs are the ones in the model's top-20 feature importance; everything else is in an "Optional inputs" section, plus optional heart rate). The result links back to the dashboard heart.
- **Assessment details:** inputs ("Not recorded" for blanks), estimated inputs, contributions, override and sign-off history.
- **Models, Users, Audit log:** model registry (admin, doctor), user management with demo tags and deactivate confirmation (admin), filterable audit log with "Load more" (admin, auditor).

### Override semantics and history

A doctor, clinician or admin can override an assessment's risk level and/or recommendation with a reason (`PATCH /api/risk-assessments/{id}/override`). Omitted fields are kept, an explicit `null` clears one, and every request appends a row to `risk_assessment_overrides`, which the details page shows as history. The model's own score and level are never changed; lists and the dashboard show the effective (overridden) level. Every override (level, recommendation or removal) returns a signed-off assessment to "Pending review".

### Demo accounts

"Try a demo" calls the public `POST /api/demo/start`, which creates a **personal sandbox** and signs the visitor straight in via a prefilled login.

- Each demo account is a real user with 6 fictional, synthetic patients scored by the real model (no real patient data). Heart rate is set on some of them.
- **Isolation:** demo users only see and change patients they own (`patients.owner_user_id`); real data and other demo users' data are invisible to them.
- **Expiry:** an account lasts 15 days (`DEMO_TTL_DAYS`). After that, login and API calls return a `demo_expired` error and the login page shows "Your 15-day demo has ended." with the contact email (`DEMO_CONTACT_EMAIL`). Demo users have the doctor role (no user management or audit log).
- **Abuse limits:** `DEMO_MAX_ACTIVE` active demos in total, `DEMO_MAX_PER_HOUR` creations per hour (global), and at most 3 demo accounts *created* per client IP per 24 hours (IPv6 counted per /64). Set `TRUST_PROXY_HEADERS=true` behind a proxy so the real client IP is used.
- **Cleanup:** `Back-End/scripts/purge_expired_demos.py` deletes demo accounts expired more than 30 days ago, with their sandbox patients and assessments. Audit rows are kept (references cleared), and each `--apply` run writes one audit row (`demo_purge`, with counts).

```bash
export DATABASE_URL=postgresql://user:password@localhost:5432/cardiology
python Back-End/scripts/purge_expired_demos.py                  # dry run: prints counts only
python Back-End/scripts/purge_expired_demos.py --apply          # delete
python Back-End/scripts/purge_expired_demos.py --grace-days 45  # custom grace period (minimum 30)
python Back-End/scripts/purge_expired_demos.py --grace-days 7 --force --apply   # allow below the minimum
```

### Credits

- 3D heart model: "Realistic human heart" by neshallads on [Sketchfab](https://sketchfab.com/3d-models/realistic-human-heart-3f8072336ce94d18b3d0d055a1ece089), licensed CC-BY 4.0. The credit is shown wherever the heart renders (`Front-End/src/app/heart/HeartCredit.tsx`).
- Landing photographs: [Unsplash](https://unsplash.com/license) (Unsplash License). Per-photo sources: `Front-End/public/landing/CREDITS.md`.

## Getting Started

### Prerequisites
- Node.js 16+ (for Front-End)
- Python 3.10-3.13 for local installs (scikit-learn 1.6.1 has no 3.14 wheels); Vercel uses 3.12 (for Back-End)
- PostgreSQL 14+ (for database; migrations use `CREATE OR REPLACE TRIGGER`)
- Docker (only for running the Back-End tests)
- npm or yarn (for Front-End dependencies)

### Front-End Setup

```bash
cd Front-End
npm install
npm run dev          # Start development server (runs on http://localhost:5173)
npm run build        # Build for production
```

### Back-End Setup

```bash
cd Back-End
pip install -r requirements.txt
cp .env.example .env     # then fill in DATABASE_URL, PATIENT_DATA_KEY, CORS_ORIGINS, ...
python app.py            # Start API server (http://localhost:8000 by default)
```

The API will be available at `http://localhost:8000` with interactive docs at `/docs`. The server host, port and auto-reload are controlled by `HOST`, `PORT` and `UVICORN_RELOAD` (see [Environment Variables](#environment-variables)). `PATIENT_DATA_KEY` is required at startup.

### Database Setup

1. Create the database and point the Back-End at it:
```bash
createdb cardiology
export DATABASE_URL=postgresql://user:password@localhost:5432/cardiology
```

2. Apply the schema and all migrations (idempotent, safe to re-run):
```bash
python Back-End/scripts/migrate.py
```

3. Create the first admin user. There is no default admin account. `seed_admin.py` imports the app, so `PATIENT_DATA_KEY` must be set too:
```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='at-least-12-characters' \
  python Back-End/scripts/seed_admin.py     # ADMIN_USERNAME defaults to "admin"
```

4. Existing deployments with plaintext patient identifiers: encrypt them in place (see [Data Privacy & Security](#data-privacy--security)). `migrate.py` and `encrypt_patient_data.py` do not read `.env`; `seed_admin.py` imports the app, which loads `Back-End/.env` for any variable you have not exported. Export the variables explicitly so you know which values are used:
```bash
export DATABASE_URL=postgresql://user:password@localhost:5432/cardiology
export PATIENT_DATA_KEY=...   # the same key the API runs with; for a new key use `openssl rand -base64 32` once and back it up
python Back-End/scripts/encrypt_patient_data.py            # dry run: prints counts only
python Back-End/scripts/encrypt_patient_data.py --apply    # encrypts rows and clears plaintext
```

## Key Features

### User Management
- Role-based access control (admin, doctor, clinician, auditor)
- User CRUD operations with soft-delete
- Session-token authentication; account lockout after repeated failed logins; minimum password length of 12
- Audit logging for all user operations

### Patient Management
- Patient creation and CRUD operations
- Sensitive data handling (DOB, contact info), encrypted by the application before storage
- Soft-delete with is_active flag
- Patient search and filtering

### Encounters & Risk Assessment
- Create encounters with optional clinical notes
- Comprehensive risk assessment form with:
  - **Mandatory fields** (AHA PREVENT inputs plus the strongest ML inputs): age (auto-derived from DOB), BMI, systolic and diastolic BP, history of high BP, BP medication (if high BP), total cholesterol, HDL, history of high cholesterol, cholesterol-lowering medication, creatinine, HbA1c, diabetes status, ever smoked, smokes now (if ever smoked), self-rated general health
  - **Optional fields** (imputed when blank): waist, urine albumin/creatinine, triglycerides, glucose, uric acid, hs-CRP, sodium, blood counts (WBC, hemoglobin, platelets, RDW), sleep, sedentary time, income ratio, race, education
  - **Additional fields**: Custom feature entries for extensibility
- Inputs are range-checked against clinical limits; the age derived from DOB must be 18-120 (the model is adult-only)
- Risk assessment combining the AHA PREVENT 10-year CVD equations, an ML model trained on NHANES 2021–2023 and guideline clinical alerts
- Response includes `missingInputs` (fields the model had to impute), `modelVersion`, and per-prediction `contributions`. Contributions describe how sensitive the model is to each input; they are not clinical importance or causal claims
- Risk score calculation with recommendation mapping
- Risk assessments are soft-deleted and record the reviewer who set the review status

### Audit Trail
- Every endpoint that reads or writes patient data writes an `audit_log` row (reads included)
- User action tracking
- Timestamp tracking for compliance

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/demo/start` - Public: create a personal demo account (see Demo accounts)
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Validate current session token and return user profile

### Users
- `GET /api/users` - List all users
- `POST /api/users` - Create user
- `PATCH /api/users/{user_id}` - Update user
- `DELETE /api/users/{user_id}` - Deactivate user (soft-delete)

### Patients
- `GET /api/patients` - List all patients
- `POST /api/patients` - Create patient
- `GET /api/patients/{patient_id}` - Get patient details
- `PATCH /api/patients/{patient_id}` - Update patient
- `DELETE /api/patients/{patient_id}` - Deactivate patient

### Encounters
- `POST /api/encounters` - Create encounter
- `GET /api/patients/{patient_id}/encounters` - List patient encounters

### Risk Assessments
- `POST /api/risk-assessments` - Create risk assessment
- `GET /api/risk-assessments` - List all risk assessments
- `GET /api/risk-assessments/{assessment_id}` - Get one risk assessment
- `PATCH /api/risk-assessments/{assessment_id}/review` - Update review status
- `PATCH /api/risk-assessments/{assessment_id}/override` - Override risk level / recommendation (history kept)
- `DELETE /api/risk-assessments/{assessment_id}` - Soft-delete risk assessment (row kept, hidden from lists)
- `GET /api/patients/{patient_id}/risk-assessments` - List patient assessments
- `POST /api/predict` - Get risk prediction

### Models / Audit / Dashboard
- `GET /api/models` - List models
- `GET /api/models/{model_id}` - Get model details
- `GET /api/audit-log` - List audit logs
- `GET /api/dashboard/stats` - Dashboard aggregate stats
- `GET /api/live` - Liveness check (no database access)
- `GET /api/health` - Readiness check (queries the database)

## Data Models

### Users
- id, username, email, password_hash, role, is_active, created_at, updated_at

### Patients
- id, name, date_of_birth (in patient_sensitive_data), is_active, created_at

### Encounters
- id, patient_id, encounter_date, notes, created_at

### Risk Assessments
- id, encounter_id, model_id, risk_score, recommendation, created_at

### Assessment Features
- assessment_id, feature_id, value (captures all input values for traceability)

## Authentication & Authorization

- Session tokens are used for API authentication (`Authorization: Bearer <token>`)
- Token stored in localStorage on front-end
- Role-based access control is enforced on both backend endpoints and frontend routes
- Unauthorized direct URL access is blocked by route guards
- Session tracking is persisted in the `sessions` table with expiry

## Data Privacy & Security

- Patient sensitive data (DOB, contact) stored separately from main patient record
- Patient identifiers are encrypted in the application with AES-256-GCM (`Back-End/phi_crypto.py`) using a key derived from `PATIENT_DATA_KEY` (at least 16 characters, required at startup; use a 32-byte random key, e.g. `openssl rand -base64 32`). Each ciphertext is bound to its patient and column (GCM associated data), and the API refuses patient endpoints with HTTP 503 if the key cannot decrypt existing data. Ciphertext is stored as opaque BYTEA in the `*_enc` columns; the key is never sent to the database
- **Losing `PATIENT_DATA_KEY` makes patient identifiers unrecoverable: back it up securely.** Do not rotate it without re-encrypting
- Soft-delete policy preserves audit trail
- Login lockout: `LOGIN_MAX_ATTEMPTS` (5) failed attempts lock the account for `LOGIN_LOCKOUT_MINUTES` (15); locked attempts return HTTP 429
- Password storage uses PBKDF2-HMAC-SHA256 with per-user salt and high iteration count
- Legacy MD5 password hashes are transparently upgraded on successful login
- Session tokens are stored hashed in the database
- SQL parameterized queries prevent injection
- Security headers are applied by the API (nosniff, frame deny, CSP, referrer policy)

## Development

### Frontend Development
- Components use React Hooks and Context API
- API calls centralized in `src/app/api/client.ts`
- Data shape mappers handle backend snake_case ↔ frontend camelCase conversion
- All state changes logged to browser console (development mode)

### Backend Development
- PostgreSQL only (via `psycopg2`, no ORM)
- Schema changes go in `Back-End/database/migrations/NNN_<name>.sql` and must be idempotent (`IF NOT EXISTS`); `scripts/migrate.py` applies `schema.sql` then every migration
- Database transactions for data consistency
- Comprehensive error handling with HTTP status codes

### Testing

Back-End tests run against a throwaway Postgres 16 container (port 55432, user/password/db `cardio_test`):

```bash
cd Back-End
pip install -r requirements-dev.txt
scripts/test_db.sh up        # start the Docker test database
pytest                       # full suite (includes slow model-training tests)
pytest -m "not slow"         # skip tests that train models
pytest -m nodb               # tests that do not need the database
scripts/test_db.sh down      # remove the container
```

Front-End (Vitest + Testing Library):

```bash
cd Front-End
npm ci
npm test          # unit and component tests
npm run lint      # ESLint, must report 0 problems
npm run build     # production build
```

## Environment Variables

Copy `Back-End/.env.example` to `Back-End/.env` and `Front-End/.env.example` to `Front-End/.env`. Never commit real `.env` files.

### Back-End

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | none | PostgreSQL connection URL. Alternatively set `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` |
| `PATIENT_DATA_KEY` | none (required) | Key for AES-256-GCM encryption of patient identifiers, at least 16 chars. Back it up: losing it makes identifiers unrecoverable |
| `DATABASE_URL_UNPOOLED` | none | Direct (non-pooled) URL. `migrate.py`, `seed_admin.py` and `encrypt_patient_data.py` prefer it over `DATABASE_URL`; the API ignores it |
| `CORS_ORIGINS` | empty (required in production) | Comma-separated exact allowed origins. Empty means no cross-origin access (fail closed); for local dev use `http://localhost:5173` |
| `CORS_ORIGIN_REGEX` | none | Optional regex, full match, for extra origins. Leave unset in production (see the deployment section) |
| `TRUST_PROXY_HEADERS` | `false` | `true`/`1`/`yes`: take the client IP from the first `X-Forwarded-For` entry (set on Vercel) |
| `SESSION_TTL_MINUTES` | `480` | Session lifetime |
| `PASSWORD_HASH_ITERATIONS` | `600000` | PBKDF2-HMAC-SHA256 iterations |
| `LOGIN_MAX_ATTEMPTS` | `5` | Failed logins before lockout |
| `LOGIN_LOCKOUT_MINUTES` | `15` | Lockout duration (HTTP 429) |
| `LOW_RISK_MAX_PROBABILITY` | from `metrics_ml.json` | Overrides the ML low-band edge (screening threshold) |
| `MEDIUM_RISK_MAX_PROBABILITY` | from `metrics_ml.json` | Overrides the ML high-band edge (90%-specificity threshold) |
| `MODEL_DIR` | `Back-End/model` | Directory holding the model files, `feature_schema.json`, `metrics_ml.json` |
| `HOST` | `0.0.0.0` | Bind address for `python app.py` |
| `PORT` | `8000` | Port for `python app.py` |
| `UVICORN_RELOAD` | `false` | Set to `true` for auto-reload in development |
| `DEMO_CONTACT_EMAIL` | built-in contact address | Shown on the login page when a demo has expired |
| `DEMO_MAX_ACTIVE` | `500` | Maximum number of active (unexpired) demo accounts |
| `DEMO_TTL_DAYS` | `15` | Demo account lifetime in days |
| `DEMO_MAX_PER_HOUR` | `30` | Maximum demo accounts created per hour |
| `ADMIN_USERNAME` | `admin` | `seed_admin.py` only |
| `ADMIN_EMAIL` | none (required by `seed_admin.py`) | `seed_admin.py` only |
| `ADMIN_PASSWORD` | none (required by `seed_admin.py`) | `seed_admin.py` only, at least 12 chars |

`Back-End/.env.example` also lists `MODEL_PATH`; the code does not read it (use `MODEL_DIR`).

### Front-End

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | empty | Backend API URL (example: `http://localhost:8000`) |
| `VITE_API_PROXY_TARGET` | empty | Optional Vite dev proxy target |

## Deploying to Vercel + Neon

Two Vercel projects from the same repository: `cvd-api` (FastAPI, Root Directory `Back-End`) and `cvd-web` (Vite SPA, Root Directory `Front-End`). Vercel builds the API with Python 3.12 (`Back-End/.python-version`) and `Back-End/vercel.json` trims the bundle.

**Optional pre-deploy check:** `Back-End/scripts/verify_vercel_bundle.sh` (needs Docker) installs the requirements in the Lambda Python 3.12 image, applies the `vercel.json` excludes, checks the size against the 500 MB limit, imports the app and scores one row. Set `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` on `cvd-api` only if the bundle ever exceeds 500 MB.

1. **Create the database.** Create a Neon project (or use Vercel, Storage, Neon integration). Pick the Neon region closest to the Vercel function region (default `iad1`, which is AWS us-east-1) to reduce latency. Note both connection strings: the pooled one (host contains `-pooler`) is `DATABASE_URL`, the direct one is `DATABASE_URL_UNPOOLED`.

2. **Migrate and seed from your machine.** `migrate.py` does not read `.env`; `seed_admin.py` imports the app, which loads `Back-End/.env` for any variable you have not exported, so export every variable explicitly. `seed_admin.py` needs `PATIENT_DATA_KEY` too. Generate the key once, copy it into a password manager, then export that value; the same value goes into Vercel, and losing it makes patient identifiers unrecoverable. A fresh database does not need `encrypt_patient_data.py`.
```bash
openssl rand -base64 32          # run once, save the output in a password manager
export DATABASE_URL_UNPOOLED='<direct-neon-url>'
export PATIENT_DATA_KEY='<the value you just saved>'
python Back-End/scripts/migrate.py
ADMIN_USERNAME=admin ADMIN_EMAIL=<you@example.com> ADMIN_PASSWORD='<your-admin-password>' \
  python Back-End/scripts/seed_admin.py     # password: at least 12 characters
```

3. **Create the `cvd-api` project.** Root Directory `Back-End`. Confirm the Framework Preset shows "FastAPI"; select it manually if it was not auto-detected. Environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Pooled Neon URL |
| `PATIENT_DATA_KEY` | The exact key used in step 2 |
| `CORS_ORIGINS` | Required. The exact `cvd-web` production domain (set in step 4), e.g. `https://cvd-web.vercel.app` |
| `CORS_ORIGIN_REGEX` | Leave unset in production (see warning below) |
| `TRUST_PROXY_HEADERS` | `true` |
| `SESSION_TTL_MINUTES` | Optional (default `480`) |

   **Recommendation: leave `CORS_ORIGIN_REGEX` unset in production** and set `CORS_ORIGINS` to the exact `cvd-web` URL. Any regex over `*.vercel.app` can be matched by a project someone else names to fit it (for example `cvd-web-x-<team-slug>`). Only for preview testing, you may use the narrower commit-preview form `^https://cvd-web-[a-z0-9]{9}-<team-slug>\.vercel\.app$`. This reduces but does not eliminate spoofing risk, so also enable Vercel Deployment Protection on preview deployments. Impact is limited because auth uses Bearer tokens held by the `cvd-web` origin, not cookies. Never use an unpinned pattern such as `https://cvd-web-.*\.vercel\.app`. `DATABASE_URL_UNPOOLED` is only needed locally for the scripts.
   Use each project's **production domain** (Project, Settings, Domains), for example `https://cvd-api.vercel.app`, everywhere a URL is needed below. Do not use a per-deployment URL: those are protected by Vercel Deployment Protection by default and answer 401, which the browser reports as a CORS error.
   If you use the Neon-Vercel integration with preview branching, preview deployments get a branched database created from the main branch: run migrations and seed before enabling previews.

4. **Create the `cvd-web` project.** Root Directory `Front-End`, Framework Preset Vite, env `VITE_API_BASE_URL=https://<cvd-api-production-domain>` (e.g. `https://cvd-api.vercel.app`). Vite inlines it at build time, so redeploy `cvd-web` after setting or changing it. Then set `CORS_ORIGINS` on `cvd-api` to the `cvd-web` production domain and redeploy `cvd-api`.
   - **Preview deployments hit production data.** If `VITE_API_BASE_URL` is set for all environments, every `cvd-web` preview calls the production `cvd-api` and therefore the production Neon database (real patient data). Scope `VITE_API_BASE_URL` to Production only. If previews are needed, point the Preview environment at a separate preview/staging `cvd-api` with its own Neon branch.
   - `Front-End/vercel.json` rewrites every route to `index.html` (fixes 404 on refresh), caches `/assets/*` immutably and sets `X-Content-Type-Options`, `Referrer-Policy` and `X-Frame-Options` headers.

5. **Smoke test.** `curl https://<cvd-api-production-domain>/api/health` (DB readiness; use `/api/live` for uptime monitors, since it does not touch the database and so does not wake Neon compute), then log in as the admin and change the admin password right away (User Management, edit your user, enter a new password of at least 12 characters). Changing your own password revokes your sessions, so you are logged out and must log in again. Then create a patient and a risk assessment. On first use the backend upserts the deployed pipeline as the single active `model_registry` row.

Interactive API docs (`/docs`, `/redoc`, `/openapi.json`) are disabled automatically on Vercel (when `VERCEL` is set) and unchanged locally.

Performance notes: route-level lazy loading (`React.lazy` + `Suspense`), manual vendor chunk splitting in the Vite build, long-cache headers for `/assets/*`.

### Upgrading an existing deployment

Releases that add database migrations (here 004 and 005: demo sandbox, clinical fields, override history) must be migrated **before** the new API serves traffic: the new `cvd-api` returns HTTP 500 on authenticated calls until the migrations are applied. Order matters:

```bash
export DATABASE_URL_UNPOOLED='<direct-neon-url>'     # the direct (non-pooler) connection string
python Back-End/scripts/migrate.py                    # applies 004 and 005; safe to re-run
```

1. Run `migrate.py` as above.
2. Redeploy `cvd-api`.
3. Redeploy `cvd-web`.

Migration 004 re-points some foreign keys to `ON DELETE SET NULL` **by constraint name**. If Neon named an existing one differently, the old `NO ACTION` key would stay in place next to the new one and demo purging would fail on audit rows. So before migrating, in `psql` run `\d audit_log` and `\d risk_assessments` and confirm the user references are named `audit_log_user_id_fkey`, `risk_assessments_reviewed_by_fkey` and `risk_assessments_deleted_by_fkey` (`risk_assessments_overridden_by_fkey` is created by the migration itself). After migrating, the same keys should show `ON DELETE SET NULL`.

Deployment environment checklist:

- `cvd-api`: `TRUST_PROXY_HEADERS=true` (required for the demo per-IP limit to see the real client behind Vercel; without it every visitor shares one IP), `PATIENT_DATA_KEY` (unchanged), `CORS_ORIGINS` (exact `cvd-web` production domain), `DATABASE_URL` (pooled), and the optional `DEMO_*` variables (`DEMO_TTL_DAYS`, `DEMO_MAX_ACTIVE`, `DEMO_MAX_PER_HOUR`, `DEMO_CONTACT_EMAIL`).
- `cvd-web`: `VITE_API_BASE_URL` scoped to **Production** only (previews must not call production data).

## Known Limitations

- ML model integration requires the artifacts in `Back-End/model/` (regenerate with `python -m ml.train`)
- The model is adult-only (derived age 18-120) and trained on a small (670-row), class-balanced dataset; see Model section
- Age auto-calculation requires patient DOB in patient_sensitive_data
- Diabetic "borderline" maps to 0.5 in feature space

## Future Enhancements

- Implement WebSocket for real-time updates
- Add export to PDF/CSV functionality
- Mobile app (React Native)
- Advanced analytics dashboard
- Multi-language support

## Methods & Approach

This project follows an engineering-first, data-driven approach to cardiology risk screening:

- Data collection: capture structured clinical values and optional free-text notes during encounters to ensure reproducible inputs for ML models.
- Deterministic feature building: encounter data is validated against clinical ranges and normalized (units, coded values, missing-value encodings) in `ml/features.py` / `ml/inference.py` before prediction.
- Shared features: `ml/nhanes.py` is imported by both the training notebook and the API, so serving computes features exactly as in training.
- Recommendation mapping: the level comes from AHA PREVENT when it applies, otherwise from the ML risk bands (`risk_bands` in `metrics_ml.json`), raised by clinical alerts; recommendations come from `cds_rules`.
- Auditable inference: every prediction stores the model id, input feature values, probability, and recommendation for traceability and post-hoc analysis.

## System Architecture (High Level)

The system is a three-tier web application with clear separation of concerns:

- Front-End (React SPA): UI components, routing, auth context, and a centralized API client that normalizes shapes and injects the bearer session token.
- Back-End (FastAPI): REST API surface for CRUD operations, authentication, ML inference endpoints (`/api/predict`, `/api/risk-assessments`), and audit logging.
- Persistence (PostgreSQL): normalized relational schema for identities, patients, encounters, model registry, assessment features, and audit logs.

Integration points and key flows:

- API Client → Back-End: front-end sends normalized requests; `client.ts` converts camelCase ↔ snake_case and attaches `Authorization: Bearer <token>`.
- Risk Prediction Flow: `POST /api/predict` loads the active model from `model_registry`, merges request values with encounter defaults, runs the ML pipeline and AHA PREVENT, applies clinical alerts → maps the level to a recommendation via `cds_rules`, and returns/stores the result.
- Model Artifacts: serialized artifacts live in `Back-End/model/` (`preprocessor_ml.joblib`, `model_{xgb,lgbm,rf,lr}.joblib`, `meta_learner.joblib`, `feature_schema.json`, `metrics_ml.json`). The back-end loads them once per process from `MODEL_DIR`.

## Data Flow & Storage

- Input validation: server-side validation sanitizes and enforces required clinical fields; defaults pulled from latest encounter when missing.
- Feature storage: raw input feature values are stored in `assessment_feature_values` to allow auditing and model retraining.
- Model registry: active/training models and metadata are tracked in `model_registry` so inference uses the correct artifact and versioning.

## Model

The risk shown to clinicians combines three parts:

1. **AHA PREVENT 10-year CVD risk** (`Back-End/ml/prevent.py`): the published equations (Khan et al., *Circulation* 2024) built from long-term follow-up cohorts. They use age, sex, total and HDL cholesterol, systolic BP, BP and cholesterol medication, diabetes, current smoking and eGFR (from creatinine, CKD-EPI 2021), plus HbA1c and urine albumin/creatinine when given. Valid for ages 30–79 and in-range inputs; otherwise the app says why and falls back to the ML level. Categories: <5% low, 5–20% medium (borderline/intermediate), ≥20% high. Unit-tested against the published worked examples.
2. **NHANES ML model** (`Back-End/model/cvd_nhanes_v2.ipynb`, served as `model/cvd_pipeline.joblib`): sigmoid-calibrated logistic regression trained on 5,330 NHANES 2021–2023 adults (34 raw inputs; BP and cholesterol medication are collected for PREVENT but kept out of the model). Label: doctor-diagnosed heart failure, coronary heart disease, angina, heart attack or stroke. Its output is a calibrated probability of *existing* diagnosed CVD, not a 10-year risk. Feature code is shared between training and serving (`Back-End/ml/nhanes.py`).
3. **Clinical alerts** (`Back-End/clinical_alerts.py`): guideline thresholds on the raw readings that can raise, never lower, the level.

Test results of the ML model (`model/metrics_ml.json`, version 4.1.0; 4,264 train / 1,066 test, 12.5% with CVD; calibration and thresholds chosen by cross-validation on the training set; test set used once):

| Metric | Value |
|---|---|
| ROC AUC | 0.861 (95% CI 0.829–0.890); 5-fold CV AUC 0.871 |
| PR-AUC | 0.489 (no-skill baseline 0.125) |
| At the screening threshold (≥ 90% sensitivity on training data) | sensitivity 0.902, specificity 0.633, **PPV 0.260**, **NPV 0.978**, 43% flagged |
| At the high-band threshold (90% specificity on training data) | sensitivity 0.624, specificity 0.870, PPV 0.407 |
| Calibration | Brier 0.083, expected calibration error 0.020, mean predicted 0.135 vs observed 0.125 |

- **ML risk bands:** low below the screening threshold, high from the high-band threshold, medium in between. The notebook writes them to `metrics_ml.json` (`risk_bands`); `LOW_RISK_MAX_PROBABILITY` / `MEDIUM_RISK_MAX_PROBABILITY` override them. They are only used when PREVENT is unavailable.
- **Reading PPV:** at 12.5% prevalence about 1 in 4 flagged people has diagnosed CVD, so a flag means "look closer"; a negative result is reliable (NPV 98%).
- **Model choice:** ten models were compared by 5-fold CV AUC: logistic regression 0.871, LightGBM 0.873, XGBoost 0.873, stack (LR + XGBoost + HistGradientBoosting + MLP) 0.875, random forest 0.865, HistGradientBoosting 0.860, SVM 0.854, MLP 0.844. The top models differ by less than the fold-to-fold spread (about ±0.03), so the simplest one (logistic regression) is used: explainable, calibrates cleanly, tiny artifact.
- **Leakage check (test set):** adding BP and cholesterol medication changes AUC 0.861 → 0.863, so they are not driving performance and stay out; removing diagnosis-history answers gives 0.853 and also removing self-rated health 0.825. No post-event variables are used.
- **Why not higher, and why PREVENT is the main risk:** NHANES is a snapshot, and the label is *already-diagnosed* CVD. Diagnosed patients are treated, so their measured cholesterol and BP are lower (mean total cholesterol 159 mg/dL in CVD patients on statins vs 196 in people without CVD or statins). The ML model therefore cannot learn "higher readings → higher risk" and does not raise its score for them; the notebook documents this (section 7). The learning curve flattens, and logistic regression ties a LightGBM/random-forest stack, so the ceiling is the data, not the algorithm. Read the ML score as "how closely the profile resembles people living with diagnosed CVD".
- **Retraining:** run `Back-End/model/cvd_nhanes_v2.ipynb` from `Back-End/model/` (it downloads the NHANES tables from the CDC into the git-ignored `model/nhanes_cache/`, writes `nhanes_cvd_2021_2023.csv`, the pipeline, `feature_schema.json`, `metrics_ml.json` and the figures). Then run `python scripts/export_global_importance.py` from `Back-End/` and update `Front-End/src/app/landing/modelFacts.ts`.
- **Clinical alerts:** hypertensive crisis (≥180/120, critical), stage 2 hypertension (≥140/90), total cholesterol ≥240, HbA1c ≥6.5 (warnings), plus low HDL, smoking, obesity and hs-CRP >10 (notes). A critical alert or three major risk factors raise the level to at least High; any warning raises it to at least Medium.
- Each assessment stores `explanation_json` with `prevent`, `modelRiskLevel` (ML), `baseRiskLevel` and `riskSource` (before alerts), and `clinicalAlerts`; the result and assessment pages show all of them.
- Per-prediction `contributions` show the ML model's sensitivity to each input, not clinical importance. The tool supports screening and is not a diagnosis.
- Each stored assessment records `model_id`; the active version is tracked in `model_registry`.

## Security, Privacy & Compliance

- Sensitive separation: PII and sensitive patient attributes are kept in `patient_sensitive_data` separate from main patient records.
- Encryption at rest: patient identifiers are encrypted in the application (AES-256-GCM, key derived from `PATIENT_DATA_KEY`, min 16 chars, required at startup) and stored as opaque BYTEA in the `*_enc` columns; the key is never sent to the database. `scripts/seed_admin.py` imports the app, so it also needs `PATIENT_DATA_KEY` set. **Losing `PATIENT_DATA_KEY` makes patient identifiers unrecoverable: back it up securely.** Migrate legacy plaintext rows with `python scripts/encrypt_patient_data.py --apply` (dry-run by default).
- Access control: role-based authorization is enforced server-side; UI hides unauthorized routes using `Layout.tsx` role gating.
- Auditability: every read or write of patient data appends an `audit_log` entry (user, timestamp, operation, resource id). Risk assessments are soft-deleted and record the reviewer.
- Injection protection: all DB access uses parameterized queries via `psycopg2` to mitigate SQL injection.

## Deployment & Operational Notes

- Environment variables: set them in the deployment environment (see the table above); `PATIENT_DATA_KEY` and `DATABASE_URL` are mandatory.
- Model updates: replace the artifacts in `Back-End/model/` and restart the back-end; the registry row is upserted automatically on first use.
- Backups & DR: schedule regular PostgreSQL backups and retain `model/` artifacts in a versioned artifact store.
- Monitoring: surface request/endpoint errors and inference latencies; log model-version with every prediction for monitoring drift.

## Contact

For architecture or ML questions, contact the development team. For deployment/ops, include model artifact checksums and relevant logs.

## Contributing

1. Create a feature branch (`git checkout -b feature/your-feature`)
2. Commit changes (`git commit -am 'Add feature'`)
3. Push to branch (`git push origin feature/your-feature`)
4. Submit pull request

## License

Proprietary - Cardiology Screening System

## Support

For issues or questions, contact the development team.
