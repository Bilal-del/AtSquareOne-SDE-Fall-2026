# SquareOne Final QA and Handoff

Date: November 23, 2026
Branch: `feature/week9-advanced-features`

## Scope and outcome

Milestone 8 performed targeted integration, responsive-browser, authorization, security, accessibility, and documentation review across the completed Milestones 1–7. No new product scope was introduced.

Two production UI defects were confirmed and fixed:

- Document Library dialogs were rendered with a static `open` attribute instead of the native modal API. Upload, edit, and delete dialogs now use `showModal()`, receive modal focus behavior, support the native cancel event, and display operation errors inside the active dialog rather than behind it. Focused frontend tests were added for the modal and validation behavior.
- The global `320px` body minimum width included the vertical scrollbar at a 320px viewport, producing a 15px horizontal overflow. The unnecessary minimum was removed and the public Job Details page was retested at 320, 375, 768, and 1280 pixels with no document-level overflow.

## Real browser integration completed

The VS Code built-in Agent Browser was used against the running Django/PostgreSQL application, not mocked API fixtures, for these checks:

- Public job listing and details loaded and survived reload.
- Anonymous administrative API requests returned `401`.
- Ordinary authenticated administrative API requests returned `403`; the Admin navigation item was absent and `/admin/jobs` redirected away.
- Registration ignored an attempted `is_staff=true` field and created a nonstaff account.
- Valid and invalid registration, login, session restoration after reload, logout, and protected-route redirection worked.
- Saving a public job as an application worked; duplicate detection appeared on a second attempt.
- Kanban/List switching, search, status change, status persistence, application editing, details, activity history, reminder validation, and reminder creation worked.
- Manual application required-field validation, creation, archive confirmation cancellation, archive, restore, and corresponding activity history worked.
- Document Library empty state and upload validation worked. After the dialog fix, initial focus was inside the modal, validation feedback was inside the modal, and the cancel event dismissed it.
- Public Job Details, Application Tracker, and Document Library were checked at approximately 320, 375, 768, and 1280 pixels without document-level horizontal overflow. At 320 pixels, the existing navigation scrolls within its own container rather than widening the page.
- The original SquareOne logo and dark-green/white branding remained intact.

The project owner had already completed real Milestone 7 staff dashboard CRUD verification before this pass. A usable staff browser session was not available during this Milestone 8 run, so the owner-confirmed dashboard workflow was not misreported as a new browser result.

## Security and data-integrity review

No critical authorization or data-integrity defect was found.

- Access tokens are held in browser memory; refresh tokens use an HttpOnly, path-scoped cookie.
- Refresh rotation and blacklisting are enabled; registration/login/refresh/logout apply CSRF protection.
- Application and document querysets enforce owner boundaries.
- Administrative API operations enforce Django `is_staff` on the backend.
- Job archival preserves the database record, application foreign keys, and application snapshots; public querysets exclude archived jobs.
- Private document access and attachment operations validate ownership. Upload validation covers allowed extensions, content types, and file size.
- S3 objects remain private and are accessed with short-lived presigned URLs.
- A filename/content-pattern scan found no committed private key or embedded AWS access key. The tracked `.env.example` contains placeholders only, and `.env` is ignored.

Deployment hardening remains required outside the demo environment: unique managed secrets, HTTPS, `DEBUG=False`, explicit hosts/origins, secure cookies, production application servers, backup/recovery, monitoring, and least-privilege IAM.

## Automated verification status

Before Milestone 8, the owner reported the full backend suite, frontend suite, ESLint, and production build passing for Milestone 7. This pass could not invoke Docker from the agent execution environment, and host Node/Django dependencies are unavailable. Therefore, the post-fix frontend suite, lint, and build are **not claimed as passed** here.

Static checks completed in this pass:

- `git diff --check`
- Python bytecode compilation for backend application/configuration modules
- Tracked filename and secret-pattern scan

Run the following owner checks after reviewing the changes:

```bash
docker compose exec -T backend python manage.py test api
docker compose exec -T backend python manage.py makemigrations api --check --dry-run
docker compose exec -T frontend npx vitest run --maxWorkers=1 --no-file-parallelism --testTimeout=15000
docker compose exec -T frontend npm run lint
docker compose exec -T frontend npm run build
git diff --check
git status -sb
```

## Test-data disposition

- Synthetic applications and their related reminder/activity records created during browser QA were deleted through their authenticated owner API after verification.
- No S3 object was uploaded, and no private user document was accessed.
- Synthetic nonstaff accounts created for authentication checks remain in the local development database: `m8_browser_1795462376952` and `m7_registration_guard_1795460884770`.
- No existing staff permissions, legitimate jobs, AWS buckets, or IAM configuration were changed.

## Remaining checks and recommendation

An owner should run the commands above because the dialog implementation changed after the previously reported green build. A real AWS-backed upload/preview/download round trip was deliberately not performed to avoid unnecessary storage use and credential exposure; verify it with a harmless synthetic file when desired. Production deployment hardening is also outside this milestone.

Functionality and documentation are ready for final review. The repository should be considered **ready to commit only after** the post-change frontend tests, lint, and production build pass in Docker.
