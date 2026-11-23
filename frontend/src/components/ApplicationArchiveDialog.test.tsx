import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ApplicationArchiveDialog from './ApplicationArchiveDialog'
import { makeApplication, makeReminder } from '../test/fixtures/applications'

const apiMocks = vi.hoisted(() => ({
  archiveApplication: vi.fn(),
  getApplicationReminders: vi.fn(),
  restoreApplication: vi.fn(),
}))

vi.mock('../api/applications', () => apiMocks)

describe('ApplicationArchiveDialog', () => {
  beforeEach(() => {
    apiMocks.archiveApplication.mockReset()
    apiMocks.getApplicationReminders.mockReset()
    apiMocks.restoreApplication.mockReset()
  })

  it('defaults to continuing reminders and permits choosing pause', async () => {
    const user = userEvent.setup()
    const application = makeApplication()
    const archived = makeApplication({ archived_at: '2026-11-21T12:00:00Z' })
    apiMocks.getApplicationReminders.mockResolvedValue([makeReminder()])
    apiMocks.archiveApplication.mockResolvedValue(archived)
    const onUpdated = vi.fn()
    render(
      <ApplicationArchiveDialog
        application={application}
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />,
    )

    expect(await screen.findByRole('radio', { name: /Continue reminders/ })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: /Pause reminders/ }))
    await user.click(screen.getByRole('button', { name: 'Archive application' }))

    await waitFor(() => expect(apiMocks.archiveApplication).toHaveBeenCalledWith(1, 'pause'))
    expect(onUpdated).toHaveBeenCalledWith(archived)
  })

  it('defaults to enabling reminders when restoring', async () => {
    const user = userEvent.setup()
    const application = makeApplication({ archived_at: '2026-11-21T12:00:00Z' })
    const restored = makeApplication()
    apiMocks.getApplicationReminders.mockResolvedValue([makeReminder({ enabled: false })])
    apiMocks.restoreApplication.mockResolvedValue(restored)
    render(
      <ApplicationArchiveDialog
        application={application}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    )

    expect(await screen.findByRole('radio', { name: /Enable reminders/ })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Restore application' }))
    await waitFor(() => expect(apiMocks.restoreApplication).toHaveBeenCalledWith(1, 'enable'))
  })

  it('uses a simple confirmation when no reminders exist', async () => {
    const user = userEvent.setup()
    apiMocks.getApplicationReminders.mockResolvedValue([])
    apiMocks.archiveApplication.mockResolvedValue(
      makeApplication({ archived_at: '2026-11-21T12:00:00Z' }),
    )
    render(
      <ApplicationArchiveDialog
        application={makeApplication()}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    )

    expect(await screen.findByText('This application has no reminders.')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Archive application' }))
    expect(apiMocks.archiveApplication).toHaveBeenCalledWith(1, 'continue')
  })

  it('blocks archive changes when reminders cannot be loaded', async () => {
    apiMocks.getApplicationReminders.mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <ApplicationArchiveDialog
        application={makeApplication()}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Reminders could not be loaded')
    expect(screen.getByRole('button', { name: 'Archive application' })).toBeDisabled()
  })
})
