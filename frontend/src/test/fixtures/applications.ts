import type {
  Application,
  ApplicationActivity,
  ApplicationDuplicate,
  ApplicationReminder,
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
    next_reminder: null,
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

export function makeReminder(
  overrides: Partial<ApplicationReminder> = {},
): ApplicationReminder {
  return {
    id: 1,
    title: 'Follow up with recruiter',
    due_date: '2026-12-01',
    due_time: null,
    note: '',
    enabled: true,
    created_at: '2026-11-21T12:00:00Z',
    updated_at: '2026-11-21T12:00:00Z',
    ...overrides,
  }
}

export function makeActivity(
  overrides: Partial<ApplicationActivity> = {},
): ApplicationActivity {
  return {
    id: 1,
    event_type: 'created',
    previous_status: null,
    new_status: null,
    description: 'Application created.',
    created_at: '2026-11-21T12:00:00Z',
    ...overrides,
  }
}
