import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    render(<ApplicationDetailsDialog application={makeApplication()} onClose={vi.fn()} />)

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
    render(<ApplicationDetailsDialog application={makeApplication()} onClose={vi.fn()} />)

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
    render(<ApplicationDetailsDialog application={makeApplication()} onClose={vi.fn()} />)

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
    const { unmount } = render(
      <ApplicationDetailsDialog application={makeApplication()} onClose={vi.fn()} />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Reminders and activity could not be loaded.',
    )
    unmount()

    apiMocks.getApplicationReminders.mockResolvedValue([])
    render(<ApplicationDetailsDialog application={makeApplication()} onClose={vi.fn()} />)
    await screen.findByText('No reminders yet.')
    await userEvent.click(screen.getByRole('button', { name: 'Add reminder' }))
    expect(screen.getByText('Reminder title is required.')).toBeInTheDocument()
    expect(screen.getByText('Due date is required.')).toBeInTheDocument()
  })
})
