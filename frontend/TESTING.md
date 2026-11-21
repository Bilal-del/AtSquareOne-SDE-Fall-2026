# Frontend testing

The component and interaction suite uses Vitest, React Testing Library,
`user-event`, and jsdom. API calls are mocked, so the suite is deterministic and
does not read or modify development database records.

## Docker Compose

After changing test dependencies, refresh the lockfile and frontend image:

```bash
docker compose run --rm frontend npm install --package-lock-only
docker compose build frontend
```

Run the non-interactive checks from the repository root:

```bash
docker compose run --rm frontend npm test
docker compose run --rm frontend npm run test:typecheck
docker compose run --rm frontend npm run test:coverage
docker compose run --rm frontend npm run lint
docker compose run --rm frontend npm run build
```

During development, `npm run test:watch` provides an interactive watch mode.

## Browser testing boundary

Playwright is intentionally not installed in the Node Alpine application image.
Its supported browser images are Debian/Ubuntu-based, and authenticated full-stack
tests also need isolated users and database records. A later browser-test setup
should use a separate Playwright service and an isolated Django test database, not
the developer database. Mocked browser tests should be labeled separately from
full-stack integration tests.
