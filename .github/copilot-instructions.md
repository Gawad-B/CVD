# Copilot Instructions for Cardiology Screening System

## Build, run, test, and lint commands

### Front-End (Vite + React)
- Install deps: `cd Front-End && npm i`
- Dev server: `cd Front-End && npm run dev`
- Production build: `cd Front-End && npm run build`

### Back-End (FastAPI + PostgreSQL)
- Install deps: `cd Back-End && pip install -r requirements.txt`
- Run API: `cd Back-End && python app.py`

### Tests and linting
- No automated test suite or lint scripts are currently configured in this repository.
- Single-test command is not available yet for the current setup.

## High-level architecture

- The project is split into `Front-End/` and `Back-End/`.
- Front-end is a React SPA (React Router) with routes defined in `Front-End/src/app/routes.tsx`, mounted from `src/main.tsx` via `App.tsx`.
- Auth/session state is managed in `Front-End/src/app/context/AuthContext.tsx` and persisted in `localStorage` (`cardio_user`, `cardio_token`).
- All API calls go through `Front-End/src/app/api/client.ts`, which:
  - auto-injects `Authorization: Bearer <token>`
  - normalizes backend snake_case and frontend camelCase shapes through mapper functions.
- Back-end is a single FastAPI app in `Back-End/app.py` using psycopg2 with direct SQL (no ORM).
- Database schema is defined in `Back-End/database/schema.sql` with key domains:
  - identities/sessions (`users`, `sessions`)
  - clinical core (`patients`, `patient_sensitive_data`, `encounters`, `encounter_features`)
  - modeling/risk (`model_registry`, `model_features`, `risk_assessments`, `assessment_feature_values`, `cds_rules`)
  - auditing (`audit_log`).
- Risk assessment flow (`POST /api/risk-assessments` and `/api/predict`) runs `_predict_and_store`:
  1. loads active model from `model_registry`
  2. merges request values with latest encounter-derived defaults
  3. runs ML inference from `Back-End/model/` artifacts
  4. maps probability to recommendation via `cds_rules`
  5. stores encounter + assessment + per-feature values.

## Key codebase conventions

- **Data shape boundary:** Backend responses are typically snake_case; frontend domain types are camelCase. Keep all translation inside `src/app/api/client.ts` mappers instead of spreading conversion logic across components.
- **Auth handling:** Use `getAuthToken()` / `fetchJson()` path in `client.ts`; do not add ad-hoc fetch calls that skip token/header behavior.
- **DB access style:** In `Back-End/app.py`, follow the existing `with db.cursor()` + parameterized SQL (`%s` placeholders) + explicit `db.commit()` write pattern.
- **Patient deletion semantics:** Patient deletion is soft-delete (`patients.is_active = FALSE`), and patient reads filter `is_active = TRUE`.
- **Risk prediction inputs:** Meta-learner inference expects NHANES-style feature columns before preprocessing. If changing risk input fields, update the request model, feature builders, and prediction mapping together.
- **Role-gated navigation:** Front-end navigation availability is role-filtered in `Layout.tsx`; new routes intended for restricted roles must be added there as well as in router definitions.
