import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ApplicationTracker from './ApplicationTracker'
import { makeApplication } from '../test/fixtures/applications'

const apiMocks = vi.hoisted(() => ({
  archiveApplication: vi.fn(),
  createApplication: vi.fn(),
  createApplicationReminder: vi.fn(),
  deleteApplication: vi.fn(),
  deleteApplicationReminder: vi.fn(),
  findApplicationDuplicates: vi.fn(),
  getAllApplications: vi.fn(),
  getApplicationActivity: vi.fn(),
  getApplicationReminders: vi.fn(),
  restoreApplication: vi.fn(),
  setApplicationRemindersEnabled: vi.fn(),
  updateApplication: vi.fn(),
  updateApplicationReminder: vi.fn(),
}))

vi.mock('../api/applications', () => apiMocks)

function renderTracker() {
  render(
    <MemoryRouter>
      <ApplicationTracker />
    </MemoryRouter>,
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('ApplicationTracker list regression coverage', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset())
    apiMocks.findApplicationDuplicates.mockResolvedValue([])
    apiMocks.getApplicationActivity.mockResolvedValue([])
    apiMocks.getApplicationReminders.mockResolvedValue([])
  })

  it('renders a loading state until applications arrive', async () => {
    const request = deferred<ReturnType<typeof makeApplication>[]>()
    apiMocks.getAllApplications.mockReturnValue(request.promise)
    renderTracker()

    expect(screen.getByText('Retrieving tracked applications…')).toBeInTheDocument()
    await act(async () => {
      request.resolve([makeApplication()])
      await request.promise
    })
    expect(await screen.findByText('Software Engineer')).toBeInTheDocument()
    expect(screen.queryByText('Retrieving tracked applications…')).not.toBeInTheDocument()
  })

  it('renders empty and failed loading states', async () => {
    apiMocks.getAllApplications.mockResolvedValueOnce([])
    const { unmount } = render(
      <MemoryRouter>
        <ApplicationTracker />
      </MemoryRouter>,
    )
    expect(await screen.findByText('No applications are being tracked yet.')).toBeInTheDocument()
    unmount()

    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    apiMocks.getAllApplications.mockRejectedValueOnce(new Error('offline'))
    renderTracker()
    expect(await screen.findByText('We couldn’t retrieve your application tracker.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('supports pagination, search, and status filtering in the List view', async () => {
    const applications = [
      makeApplication({ id: 1, job_title: 'First Role', status: 'saved' }),
      makeApplication({ id: 2, job_title: 'Second Role', status: 'applied' }),
      makeApplication({ id: 3, job_title: 'Third Role', status: 'interviewing' }),
      makeApplication({ id: 4, job_title: 'Fourth Role', status: 'rejected' }),
      makeApplication({ id: 5, job_title: 'Fifth Role', status: 'accepted' }),
      makeApplication({ id: 6, job_title: 'Sixth Role', company: 'Unique Company', status: 'offered' }),
    ]
    apiMocks.getAllApplications.mockResolvedValue(applications)
    const user = userEvent.setup()
    renderTracker()

    expect(await screen.findByText('First Role')).toBeInTheDocument()
    expect(screen.queryByText('Sixth Role')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 1–5 of 6')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Next/ }))
    expect(screen.getByText('Sixth Role')).toBeInTheDocument()
    expect(screen.getByText('Showing 6–6 of 6')).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: /search company or role/i }), 'unique')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.getByText('Sixth Role')).toBeInTheDocument()
    expect(screen.getByText('1 match')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: /filter by application status/i }),
      'rejected',
    )
    expect(screen.getByText('Fourth Role')).toBeInTheDocument()
    expect(screen.queryByText('First Role')).not.toBeInTheDocument()
  })

  it('adds a successfully created manual application to the tracker', async () => {
    const user = userEvent.setup()
    const created = makeApplication({ id: 20, job_title: 'New Manual Role' })
    apiMocks.getAllApplications.mockResolvedValue([])
    apiMocks.createApplication.mockResolvedValue(created)
    renderTracker()

    await screen.findByText('No applications are being tracked yet.')
    await user.click(screen.getByRole('button', { name: 'Add application' }))
    await user.type(screen.getByRole('textbox', { name: /job title/i }), created.job_title)
    await user.type(screen.getByRole('textbox', { name: /company name/i }), created.company)
    await user.click(screen.getByRole('button', { name: 'Save application' }))

    expect(await screen.findByText('New Manual Role')).toBeInTheDocument()
    expect(screen.getByText('New Manual Role was added to your tracker.')).toBeInTheDocument()
    const createdRow = screen.getByRole('row', { name: /New Manual Role Example Corp/ })
    expect(within(createdRow).getByText('Saved')).toBeInTheDocument()
  })

  it('keeps existing edit and permanent delete workflows functional', async () => {
    const user = userEvent.setup()
    const original = makeApplication({ id: 7 })
    const updated = makeApplication({ id: 7, job_title: 'Staff Engineer' })
    apiMocks.getAllApplications.mockResolvedValue([original])
    apiMocks.updateApplication.mockResolvedValue(updated)
    apiMocks.deleteApplication.mockResolvedValue(undefined)
    renderTracker()

    const originalRow = await screen.findByRole('row', { name: /Software Engineer Example Corp/ })
    await user.click(within(originalRow).getByRole('button', { name: 'Edit' }))
    await user.clear(screen.getByRole('textbox', { name: /job title/i }))
    await user.type(screen.getByRole('textbox', { name: /job title/i }), 'Staff Engineer')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const updatedRow = await screen.findByRole('row', { name: /Staff Engineer Example Corp/ })
    expect(screen.getByText('Staff Engineer was updated successfully.')).toBeInTheDocument()
    await user.click(within(updatedRow).getByRole('button', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Remove application' }))

    await waitFor(() => expect(apiMocks.deleteApplication).toHaveBeenCalledWith(7))
    expect(await screen.findByText('No applications are being tracked yet.')).toBeInTheDocument()
    expect(screen.getByText('Staff Engineer was removed successfully.')).toBeInTheDocument()
  })

  it('loads Active, Archived, and All archive views from the API', async () => {
    const user = userEvent.setup()
    const active = makeApplication({ id: 1, job_title: 'Active Role' })
    const archived = makeApplication({
      id: 2,
      job_title: 'Archived Role',
      archived_at: '2026-11-20T12:00:00Z',
    })
    apiMocks.getAllApplications.mockImplementation(
      ({ archive_state }: { archive_state: 'active' | 'archived' | 'all' }) => {
        if (archive_state === 'archived') return Promise.resolve([archived])
        if (archive_state === 'all') return Promise.resolve([active, archived])
        return Promise.resolve([active])
      },
    )
    renderTracker()

    expect(await screen.findByText('Active Role')).toBeInTheDocument()
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by archive state' }),
      'archived',
    )
    expect(await screen.findByText('Archived Role')).toBeInTheDocument()
    expect(
      screen.getByText('Archived', {
        selector: '.application-archived-badge',
      })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by archive state' }),
      'all',
    )
    expect(await screen.findByText('Active Role')).toBeInTheDocument()
    expect(screen.getByText('Archived Role')).toBeInTheDocument()
    expect(apiMocks.getAllApplications).toHaveBeenCalledWith({ archive_state: 'all' })
  })
})
