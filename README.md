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
- JWT-based authentication
- Audit logging system

## Project Structure

```
Cardiology Screening System/
├── Front-End/              # React application
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/       # API client layer, types
│   │   │   ├── components/ # React components
│   │   │   ├── context/    # Auth context
│   │   │   └── routes.tsx  # Router configuration
│   │   ├── main.tsx        # React entry point
│   │   ├── App.tsx         # App wrapper
│   │   └── index.css       # Global styles
│   ├── package.json
│   └── vite.config.ts
├── Back-End/               # FastAPI application
│   ├── app.py              # Main API server
│   ├── requirements.txt    # Python dependencies
│   ├── model/              # ML model artifacts
│   └── database/
│       └── schema.sql      # Database schema
├── Assets/                 # Project resources
├── .gitignore             # Git ignore rules
└── README.md              # This file
```

## Getting Started

### Prerequisites
- Node.js 16+ (for Front-End)
- Python 3.8+ (for Back-End)
- PostgreSQL 12+ (for database)
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
python app.py        # Start API server (runs on http://localhost:8000)
```

The API will be available at `http://localhost:8000` with interactive docs at `/docs`.

### Database Setup

1. Create PostgreSQL database:
```bash
createdb cardiology
psql cardiology < Back-End/database/schema.sql
```

2. Ensure the Back-End can connect to PostgreSQL (configure connection in `app.py`)

## Key Features

### User Management
- Role-based access control (admin, doctor, clinician, auditor)
- User CRUD operations with soft-delete
- JWT authentication with token refresh
- Audit logging for all user operations

### Patient Management
- Patient creation and CRUD operations
- Sensitive data handling (DOB, contact info)
- Soft-delete with is_active flag
- Patient search and filtering

### Encounters & Risk Assessment
- Create encounters with optional clinical notes
- Comprehensive risk assessment form with:
  - **Mandatory fields**: Systolic/diastolic BP, total cholesterol, HDL cholesterol, BMI, smoker status, diabetic status (yes/no/borderline), age (auto-derived from DOB), HbA1c, hs-CRP, sodium, WBC, hemoglobin, platelets, RDW, activity levels, sleep hours, BP/cholesterol medication history
  - **Additional fields**: Custom feature entries for extensibility
- ML-powered risk prediction using meta-learner model
- Risk score calculation with recommendation mapping

### Audit Trail
- Comprehensive logging of all data modifications
- User action tracking
- Timestamp tracking for compliance

## API Endpoints

### Authentication
- `POST /api/login` - User login
- `POST /api/logout` - User logout
- `POST /api/refresh-token` - Refresh JWT token

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
- `GET /api/patients/{patient_id}/risk-assessments` - List patient assessments
- `POST /api/predict` - Get risk prediction

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

- JWT tokens used for API authentication
- Token stored in localStorage on front-end
- Automatic token refresh on expiry
- Role-based access control enforced server-side
- Session tracking with optional user context

## Data Privacy & Security

- Patient sensitive data (DOB, contact) stored separately from main patient record
- Soft-delete policy preserves audit trail
- Encrypted password storage with bcrypt
- SQL parameterized queries prevent injection
- JWT tokens with configurable expiry

## Development

### Frontend Development
- Components use React Hooks and Context API
- API calls centralized in `src/app/api/client.ts`
- Data shape mappers handle backend snake_case ↔ frontend camelCase conversion
- All state changes logged to browser console (development mode)

### Backend Development
- SQLite-based development (configurable)
- PostgreSQL for production
- Database transactions for data consistency
- Comprehensive error handling with HTTP status codes

### Testing
Currently no automated test suite. Test manually via:
- Front-End: Browser console and React DevTools
- Back-End: FastAPI Swagger UI at `/docs` or `curl` requests

## Environment Variables

### Front-End
- `VITE_API_URL` - Backend API URL (default: http://localhost:8000)

### Back-End
Configure in `app.py`:
- Database connection string
- JWT secret key
- CORS origins
- Model paths

## Known Limitations

- No automated tests (TBD)
- ML model integration requires pre-trained artifacts in `Back-End/model/`
- Age auto-calculation requires patient DOB in patient_sensitive_data
- Diabetic "borderline" maps to 0.5 in feature space

## Future Enhancements

- Add automated unit/integration tests
- Implement WebSocket for real-time updates
- Add export to PDF/CSV functionality
- Mobile app (React Native)
- Advanced analytics dashboard
- Multi-language support

## Methods & Approach

This project follows an engineering-first, data-driven approach to cardiology risk screening:

- Data collection: capture structured clinical values and optional free-text notes during encounters to ensure reproducible inputs for ML models.
- Deterministic feature building: encounter data is validated and normalized (units, ranges, missing-value encodings) before model preprocessing.
- Preprocessing + meta-learner: a serialized preprocessor converts raw clinical fields into model-ready features; a meta-learner combines base-model outputs to produce a calibrated risk probability.
- Recommendation mapping: ML probabilities are mapped to actionable recommendations via rule-driven CDS rules stored in `cds_rules` and configurable thresholds.
- Auditable inference: every prediction stores the model id, input feature values, probability, and recommendation for traceability and post-hoc analysis.

## System Architecture (High Level)

The system is a three-tier web application with clear separation of concerns:

- Front-End (React SPA): UI components, routing, auth context, and a centralized API client that normalizes shapes and injects JWT tokens.
- Back-End (FastAPI): REST API surface for CRUD operations, authentication, ML inference endpoints (`/api/predict`, `/api/risk-assessments`), and audit logging.
- Persistence (PostgreSQL): normalized relational schema for identities, patients, encounters, model registry, assessment features, and audit logs.

Integration points and key flows:

- API Client → Back-End: front-end sends normalized requests; `client.ts` converts camelCase ↔ snake_case and attaches `Authorization: Bearer <token>`.
- Risk Prediction Flow: `POST /api/predict` loads the active model from `model_registry`, merges request values with encounter defaults, runs preprocessor → meta-learner → maps probability to a recommendation via `cds_rules`, and returns/stores the result.
- Model Artifacts: serialized artifacts live in `Back-End/model/` (preprocessor, base models, meta-learner). The back-end loads these at runtime or per-request based on `model_registry` configuration.

## Data Flow & Storage

- Input validation: server-side validation sanitizes and enforces required clinical fields; defaults pulled from latest encounter when missing.
- Feature storage: raw input feature values are stored in `assessment_feature_values` to allow auditing and model retraining.
- Model registry: active/training models and metadata are tracked in `model_registry` so inference uses the correct artifact and versioning.

## ML Inference Details

- Preprocessing: numeric scaling, categorical encoding, and missing-value handling are performed by `preprocessor_ml.joblib`.
- Ensemble/meta-learner: base models (LR, RF, XGB, LGBM) provide complementary signals; `meta_learner.joblib` weights and calibrates them to output a final probability.
- Reproducibility: each stored assessment records `model_id`, `model_version`, and artifact checksums when available.

## Security, Privacy & Compliance

- Sensitive separation: PII and sensitive patient attributes are kept in `patient_sensitive_data` separate from main patient records.
- Access control: role-based authorization is enforced server-side; UI hides unauthorized routes using `Layout.tsx` role gating.
- Auditability: all write operations append entries to `audit_log` including user, timestamp, operation, and affected resource id.
- Injection protection: all DB access uses parameterized queries via `psycopg2` to mitigate SQL injection.

## Deployment & Operational Notes

- Environment variables: configure DB connection, JWT secret, CORS origins, and model paths in `app.py` or a deployment env manager.
- Model updates: when deploying new model artifacts, update `model_registry` and restart the back-end (or implement a hot-reload endpoint) to pick up the new artifact.
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

