# SquareOne Job Search and Application Tracker

SquareOne is a full-stack job discovery and application-management platform. It combines public job search with a private, per-user application command center, reusable document storage, reminders, and a staff-only job administration dashboard.

## Technology

- React 19, TypeScript, Vite, Vitest, and React Testing Library
- Django, Django REST Framework, and Simple JWT
- PostgreSQL 15
- Docker Compose
- Private Amazon S3 document storage with short-lived presigned URLs

## Features

- Public job search, filtering, pagination, and job details
- Registration, login, refresh-token session restoration, and logout
- Per-user application tracking with duplicate detection
- Kanban and list views across eight application statuses
- Manual applications, editing, activity history, and follow-up reminders
- Private document upload, preview, download, reuse, attachment, and detachment
- Staff-only job statistics, search, filtering, creation, editing, archiving, and restoration
- Reversible job soft deletion that preserves applications and historical snapshots

## Architecture and access model

The browser keeps the short-lived JWT access token in memory. The refresh token is stored in an HttpOnly cookie scoped to `/api/auth/`; refresh-token rotation and blacklisting are enabled. State-changing authentication endpoints require Django's CSRF token.

Application, reminder, activity, attachment, and document queries are scoped to the authenticated owner. Administration uses Django's existing `is_staff` flag and is enforced by backend permissions as well as the frontend route guard. Public registration and profile updates cannot assign staff privileges.

Uploaded objects remain private in S3. The API validates ownership, extension, content type, and size, and returns short-lived presigned access URLs rather than public object URLs. See the [AWS document storage guide](docs/AWS_DOCUMENT_STORAGE.md).

## Local setup

Prerequisites are Docker with Compose and Git. Host installations of Python, Node.js, and PostgreSQL are not required.

```bash
git clone <repository-url>
cd AtSquareOne-SDE-Fall-2026
cp .env.example .env
docker compose build
docker compose up -d
docker compose exec -T backend python manage.py migrate
```

Create a local administrator only when needed:

```bash
docker compose exec backend python manage.py createsuperuser
```

Services:

- Frontend: `http://localhost:5173`
- API health check: `http://localhost:8000/api/health/`
- Django administration: `http://localhost:8000/admin/`
- OpenAPI/Swagger UI: `http://localhost:8000/swagger/`

The SquareOne staff dashboard is available at `http://localhost:5173/admin/jobs` to authenticated users whose Django account has `is_staff=True`. Staff access must be assigned through a trusted Django administrative workflow, never public registration.

## Environment configuration

The checked-in `.env.example` contains names and placeholders only. Never commit `.env`, AWS keys, database credentials, JWTs, or presigned URLs.

Document storage variables:

```text
AWS_REGION
AWS_DOCUMENT_BUCKET
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_SESSION_TOKEN
```

Prefer an IAM role or another standard AWS credential provider over long-lived local keys. Backend deployment configuration also includes `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `FRONTEND_ORIGINS`, and `AUTH_COOKIE_SECURE`. Production must use a unique secret, `DEBUG=False`, explicit HTTPS origins/hosts, and secure cookies.

## Database migrations

```bash
docker compose exec -T backend python manage.py migrate
docker compose exec -T backend python manage.py makemigrations api --check --dry-run
```

Do not generate a migration merely because local services are out of sync. Review model changes first and keep migrations in source control.

## Verification

Backend tests and migration consistency:

```bash
docker compose exec -T backend python manage.py test api
docker compose exec -T backend python manage.py makemigrations api --check --dry-run
```

Frontend tests, lint, and production build:

```bash
docker compose exec -T frontend npx vitest run --maxWorkers=1 --no-file-parallelism --testTimeout=15000
docker compose exec -T frontend npm run lint
docker compose exec -T frontend npm run build
```

Repository checks:

```bash
git diff --check
git status -sb
```

## Development operations

```bash
docker compose up -d
docker compose logs -f backend
docker compose logs -f frontend
docker compose down
```

Avoid `docker compose down -v` unless intentionally destroying the local PostgreSQL volume and all local data.

## Development and deployment limitations

The Compose configuration is a development environment: it uses Django's development server, Vite's development server, a sample database password, and `DEBUG=True`. It is not a production deployment template. A production release still needs a hardened reverse proxy/application server, managed secrets, TLS, backups, logging/monitoring, production CORS/host settings, and least-privilege IAM.

Private S3 integration requires owner-provided AWS configuration and should be verified in the intended AWS account without exposing private documents or credentials. Future opportunities include employer accounts, AI-assisted job aggregation, and production deployment automation; they are intentionally outside the current project scope.

See [Final QA and handoff](docs/FINAL_QA_HANDOFF.md) for the latest verification record and remaining owner checks.
