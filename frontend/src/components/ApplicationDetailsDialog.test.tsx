import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ApplicationDetailsDialog from './ApplicationDetailsDialog'
import {
  makeActivity,
  makeApplication,
  makeReminder,
} from '../test/fixtures/applications'

const apiMocks = vi.hoisted(() => ({
  createApplicationReminder: vi.fn(),
  deleteApplicationReminder: vi.fn(),
  getApplicationActivity: vi.fn(),
  getApplicationReminders: vi.fn(),
  setApplicationRemindersEnabled: vi.fn(),
  updateApplicationReminder: vi.fn(),
}))

vi.mock('../api/applications', () => apiMocks)

function renderDetails(
  application = makeApplication(),
  props: Partial<ComponentProps<typeof ApplicationDetailsDialog>> = {},
) {
  return render(
    <MemoryRouter>
      <ApplicationDetailsDialog application={application} onClose={vi.fn()} {...props} />
    </MemoryRouter>,
  )
}

describe('ApplicationDetailsDialog', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset())
    apiMocks.getApplicationActivity.mockResolvedValue([makeActivity()])
    apiMocks.getApplicationReminders.mockResolvedValue([])
  })

  it('creates a reminder and displays activity', async () => {
    const user = userEvent.setup()
    const created = makeReminder({ id: 2, title: 'Check application portal' })
    apiMocks.createApplicationReminder.mockResolvedValue(created)
    renderDetails()

    expect(await screen.findByText('Application created.')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: /Reminder title/ }), created.title)
    fireEvent.change(screen.getByLabelText(/Due date/), {
      target: { value: created.due_date },
    })
    await user.type(screen.getByRole('textbox', { name: /Additional note/ }), 'Check for an update.')
    await user.click(screen.getByRole('button', { name: 'Add reminder' }))

    await waitFor(() => expect(apiMocks.createApplicationReminder).toHaveBeenCalledWith(1, {
      due_date: '2026-12-01',
      due_time: null,
      note: 'Check for an update.',
      title: 'Check application portal',
    }))
    expect(screen.getByText('Check application portal')).toBeInTheDocument()
  })

  it('edits an existing reminder', async () => {
    const user = userEvent.setup()
    const original = makeReminder()
    const updated = makeReminder({ title: 'Follow up with hiring manager' })
    apiMocks.getApplicationReminders.mockResolvedValue([original])
    apiMocks.updateApplicationReminder.mockResolvedValue(updated)
    renderDetails()

    const reminderTitle = await screen.findByText(original.title)
    const reminder = reminderTitle.closest('li')
    expect(reminder).not.toBeNull()
    await user.click(within(reminder as HTMLElement).getByRole('button', { name: 'Edit' }))
    const title = screen.getByRole('textbox', { name: /Reminder title/ })
    await user.clear(title)
    await user.type(title, updated.title)
    await user.click(screen.getByRole('button', { name: 'Save reminder' }))

    await waitFor(() => expect(apiMocks.updateApplicationReminder).toHaveBeenCalledWith(
      1,
      1,
      expect.objectContaining({ title: 'Follow up with hiring manager' }),
    ))
    expect(screen.getByText('Follow up with hiring manager')).toBeInTheDocument()
  })

  it('toggles an individual reminder and all application reminders', async () => {
    const user = userEvent.setup()
    const original = makeReminder()
    apiMocks.getApplicationReminders.mockResolvedValue([original])
    apiMocks.updateApplicationReminder.mockResolvedValue(
      makeReminder({ enabled: false }),
    )
    apiMocks.setApplicationRemindersEnabled.mockResolvedValue({
      affected: 1,
      enabled: true,
    })
    renderDetails()

    await user.click(await screen.findByRole('button', {
      name: 'Disable reminder Follow up with recruiter',
    }))
    expect(apiMocks.updateApplicationReminder).toHaveBeenCalledWith(1, 1, {
      enabled: false,
    })

    await user.click(screen.getByRole('button', {
      name: 'Enable all reminders for Software Engineer',
    }))
    expect(apiMocks.setApplicationRemindersEnabled).toHaveBeenCalledWith(1, true)
  })

  it('shows loading errors and required-field errors', async () => {
    apiMocks.getApplicationReminders.mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { unmount } = renderDetails()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Reminders and activity could not be loaded.',
    )
    unmount()

    apiMocks.getApplicationReminders.mockResolvedValue([])
    renderDetails()
    await screen.findByText('No reminders yet.')
    await userEvent.click(screen.getByRole('button', { name: 'Add reminder' }))
    expect(screen.getByText('Reminder title is required.')).toBeInTheDocument()
    expect(screen.getByText('Due date is required.')).toBeInTheDocument()
  })

  it('displays complete manual application information and sensible empty states', async () => {
    renderDetails(makeApplication({
      job_title: 'Platform Engineer',
      company: 'Northwind Labs',
      location: 'Chicago, IL',
      status: 'interviewing',
      applied_date: '2026-11-10',
      work_arrangement: 'hybrid',
      employment_type: 'full_time',
      notes: 'Prepare system design examples.',
    }))

    expect(screen.getByRole('heading', { name: 'Job information' })).toBeInTheDocument()
    expect(screen.getByText('Manual application')).toBeInTheDocument()
    expect(screen.getByText('Chicago, IL')).toBeInTheDocument()
    expect(screen.getByText('Hybrid')).toBeInTheDocument()
    expect(screen.getByText('Full-time')).toBeInTheDocument()
    expect(screen.getByText('Interviewing')).toBeInTheDocument()
    expect(screen.getByText('Prepare system design examples.')).toBeInTheDocument()
    expect(screen.getByText('Not provided')).toBeInTheDocument()
    expect(await screen.findByText('No reminders yet.')).toBeInTheDocument()
  })

  it('displays linked job information and exposes existing management callbacks', async () => {
    const user = userEvent.setup()
    const linked = makeApplication({
      job: 42,
      source: 'squareone',
      external_job_url: 'https://example.com/jobs/42',
      archived_at: '2026-11-20T12:00:00Z',
    })
    const onEdit = vi.fn()
    const onArchiveChange = vi.fn()
    const onDelete = vi.fn()
    renderDetails(linked, { onEdit, onArchiveChange, onDelete })

    expect(screen.getByText('SquareOne job listing')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View SquareOne listing' })).toHaveAttribute('href', '/jobs/42')
    expect(screen.getByText('Archived', { selector: 'dd' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit application' }))
    await user.click(screen.getByRole('button', { name: 'Restore application' }))
    await user.click(screen.getByRole('button', { name: 'Permanently delete' }))
    expect(onEdit).toHaveBeenCalledWith(linked)
    expect(onArchiveChange).toHaveBeenCalledWith(linked)
    expect(onDelete).toHaveBeenCalledWith(linked)
  })

  it('keeps application information visible when follow-up data fails to load', async () => {
    apiMocks.getApplicationReminders.mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderDetails(makeApplication({ notes: 'Visible while offline.' }))

    expect(screen.getByText('Visible while offline.')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Reminders and activity could not be loaded.',
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
