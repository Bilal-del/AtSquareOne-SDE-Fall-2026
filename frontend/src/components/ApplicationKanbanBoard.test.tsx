import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Application } from '../api/applications'
import type { ApplicationStatus } from '../constants/applicationStatuses'
import { makeApplication } from '../test/fixtures/applications'
import ApplicationKanbanBoard from './ApplicationKanbanBoard'

function StatefulBoard({
  initialApplications,
  updateStatus = vi.fn().mockResolvedValue(undefined),
}: {
  initialApplications: Application[]
  updateStatus?: (application: Application, status: ApplicationStatus) => Promise<void>
}) {
  const [applications, setApplications] = useState(initialApplications)
  return (
    <ApplicationKanbanBoard
      applications={applications}
      onOpenApplication={vi.fn()}
      onStatusChange={async (application, status) => {
        await updateStatus(application, status)
        setApplications((current) => current.map((item) =>
          item.id === application.id ? { ...item, status } : item
        ))
      }}
    />
  )
}

describe('ApplicationKanbanBoard', () => {
  beforeEach(() => {
    window.localStorage.removeItem('squareone.applicationTracker.columns')
  })

  it('shows the four default columns with correct grouping and detailed metadata', () => {
    const saved = makeApplication({
      id: 1,
      location: 'Chicago, IL',
      work_arrangement: 'hybrid',
      employment_type: 'full_time',
      applied_date: '2026-11-10',
      archived_at: '2026-11-20T12:00:00Z',
      next_reminder: {
        id: 3,
        title: 'Contact recruiter',
        due_date: '2020-01-01',
        due_time: null,
      },
    })
    const applied = makeApplication({ id: 2, job_title: 'Product Engineer', status: 'applied' })
    const hidden = makeApplication({ id: 3, job_title: 'Rejected Role', status: 'rejected' })
    render(
      <ApplicationKanbanBoard
        applications={[saved, applied, hidden]}
        onOpenApplication={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    )

    const savedColumn = screen.getByRole('region', { name: 'Saved' })
    const appliedColumn = screen.getByRole('region', { name: 'Applied' })
    expect(within(savedColumn).getByLabelText('1 application')).toBeInTheDocument()
    expect(within(appliedColumn).getByLabelText('1 application')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Interviewing' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Offered' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Rejected' })).not.toBeInTheDocument()
    expect(within(savedColumn).getByText(/Chicago, IL/)).toBeInTheDocument()
    expect(within(savedColumn).getByText('Hybrid')).toBeInTheDocument()
    expect(within(savedColumn).getByText('Full-time')).toBeInTheDocument()
    expect(within(savedColumn).getByText('Contact recruiter')).toBeInTheDocument()
    expect(within(savedColumn).getByText('Overdue')).toBeInTheDocument()
    expect(within(savedColumn).getByText('Archived')).toBeInTheDocument()
    expect(screen.queryByText('Rejected Role')).not.toBeInTheDocument()
  })

  it('opens details and moves a card through the accessible status control', async () => {
    const user = userEvent.setup()
    const application = makeApplication()
    const onOpen = vi.fn()
    const updateStatus = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <ApplicationKanbanBoard
        applications={[application]}
        onOpenApplication={onOpen}
        onStatusChange={updateStatus}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Software Engineer Example Corp/ }))
    expect(onOpen).toHaveBeenCalledWith(application)

    rerender(<StatefulBoard initialApplications={[application]} updateStatus={updateStatus} />)
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Change status for Software Engineer' }),
      'rejected',
    )
    await waitFor(() => expect(updateStatus).toHaveBeenCalledWith(application, 'rejected'))
    expect(screen.queryByText('Software Engineer')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Manage columns' }))
    await user.click(screen.getByRole('checkbox', { name: 'Rejected' }))
    expect(screen.getByRole('region', { name: 'Rejected' })).toHaveTextContent('Software Engineer')
  })

  it('allows zero visible columns and restores the manager from the empty state', async () => {
    const user = userEvent.setup()
    render(
      <ApplicationKanbanBoard
        applications={[makeApplication()]}
        onOpenApplication={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Manage columns' }))
    for (const label of ['Saved', 'Applied', 'Interviewing', 'Offered']) {
      await user.click(screen.getByRole('checkbox', { name: label }))
    }

    expect(screen.getByText('Choose the stages you want to see.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Application status board')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Manage columns' })).toHaveLength(2)
  })

  it('reports a failed status update and leaves the card in its original column', async () => {
    const user = userEvent.setup()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const application = makeApplication()
    render(
      <ApplicationKanbanBoard
        applications={[application]}
        onOpenApplication={vi.fn()}
        onStatusChange={vi.fn().mockRejectedValue(new Error('offline'))}
      />,
    )

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Change status for Software Engineer' }),
      'applied',
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('previous status was restored')
    expect(screen.getByRole('region', { name: 'Saved' })).toHaveTextContent('Software Engineer')
  })
})
