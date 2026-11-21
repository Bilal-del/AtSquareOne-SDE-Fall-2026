import type {
  Application,
  ApplicationDuplicate,
} from '../../api/applications'

export function makeApplication(
  overrides: Partial<Application> = {},
): Application {
  return {
    id: 1,
    job: null,
    job_title: 'Software Engineer',
    company: 'Example Corp',
    source: 'manual',
    location: '',
    external_job_url: '',
    work_arrangement: '',
    employment_type: '',
    status: 'saved',
    applied_date: null,
    notes: '',
    archived_at: null,
    created_at: '2026-11-01T12:00:00Z',
    updated_at: '2026-11-01T12:00:00Z',
    ...overrides,
  }
}

export function makeDuplicate(
  overrides: Partial<ApplicationDuplicate> = {},
): ApplicationDuplicate {
  return {
    id: 1,
    job: null,
    job_title: 'Software Engineer',
    company: 'Example Corp',
    source: 'manual',
    status: 'saved',
    archived_at: null,
    ...overrides,
  }
}
