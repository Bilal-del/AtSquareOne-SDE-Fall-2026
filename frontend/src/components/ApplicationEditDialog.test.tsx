import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ApplicationEditDialog from './ApplicationEditDialog'
import { makeApplication } from '../test/fixtures/applications'

const apiMocks = vi.hoisted(() => ({
  updateApplication: vi.fn(),
}))

vi.mock('../api/applications', () => apiMocks)

function renderDialog(application = makeApplication()) {
  const onClose = vi.fn()
  const onMissing = vi.fn()
  const onUpdated = vi.fn()
  render(
    <ApplicationEditDialog
      application={application}
      onClose={onClose}
      onMissing={onMissing}
      onUpdated={onUpdated}
    />,
  )
  return { onClose, onMissing, onUpdated }
}

describe('ApplicationEditDialog', () => {
  beforeEach(() => {
    apiMocks.updateApplication.mockReset()
  })

  it('allows manual job identity and personal fields to be edited', async () => {
    const user = userEvent.setup()
    const original = makeApplication()
    const updated = makeApplication({
      company: 'New Company',
      job_title: 'Senior Engineer',
      location: 'Remote',
      notes: 'Updated notes',
    })
    apiMocks.updateApplication.mockResolvedValue(updated)
    const { onUpdated } = renderDialog(original)

    await user.clear(screen.getByRole('textbox', { name: /job title/i }))
    await user.type(screen.getByRole('textbox', { name: /job title/i }), 'Senior Engineer')
    await user.clear(screen.getByRole('textbox', { name: /company name/i }))
    await user.type(screen.getByRole('textbox', { name: /company name/i }), 'New Company')
    await user.type(screen.getByRole('textbox', { name: /job location/i }), 'Remote')
    await user.type(screen.getByRole('textbox', { name: /personal notes/i }), 'Updated notes')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(apiMocks.updateApplication).toHaveBeenCalledWith(original.id, {
      company: 'New Company',
      job_title: 'Senior Engineer',
      location: 'Remote',
      notes: 'Updated notes',
    }))
    expect(onUpdated).toHaveBeenCalledWith(updated)
  })

  it('keeps linked job title and company read-only while personal fields remain editable', async () => {
    const user = userEvent.setup()
    const linked = makeApplication({
      company: 'SquareOne Partner',
      job: 42,
      job_title: 'Platform Engineer',
      source: 'squareone',
    })
    const updated = makeApplication({
      ...linked,
      location: 'Austin, TX',
      status: 'offered',
    })
    apiMocks.updateApplication.mockResolvedValue(updated)
    renderDialog(linked)

    expect(screen.queryByRole('textbox', { name: /job title/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /company name/i })).not.toBeInTheDocument()
    expect(screen.getByText(/managed by the linked SquareOne job/i)).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: /job location/i }), 'Austin, TX')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'offered')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(apiMocks.updateApplication).toHaveBeenCalledWith(linked.id, {
      location: 'Austin, TX',
      status: 'offered',
    }))
    expect(apiMocks.updateApplication.mock.calls[0][1]).not.toHaveProperty('job_title')
    expect(apiMocks.updateApplication.mock.calls[0][1]).not.toHaveProperty('company')
  })

  it('offers and submits all eight approved statuses', async () => {
    const user = userEvent.setup()
    const original = makeApplication()
    apiMocks.updateApplication.mockResolvedValue(makeApplication({ status: 'closed' }))
    renderDialog(original)

    const status = screen.getByRole('combobox', { name: 'Status' })
    expect(Array.from(status.querySelectorAll('option')).map((option) => option.textContent)).toEqual([
      'Saved',
      'Applied',
      'Interviewing',
      'Offered',
      'Accepted',
      'Rejected',
      'Withdrawn',
      'Closed',
    ])

    await user.selectOptions(status, 'closed')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(apiMocks.updateApplication).toHaveBeenCalledWith(original.id, {
      status: 'closed',
    }))
  })

  it('validates blank manual identity fields before sending an update', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.clear(screen.getByRole('textbox', { name: /job title/i }))
    await user.clear(screen.getByRole('textbox', { name: /company name/i }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getByText('Job title is required.')).toBeInTheDocument()
    expect(screen.getByText('Company name is required.')).toBeInTheDocument()
    expect(apiMocks.updateApplication).not.toHaveBeenCalled()
  })

  it('shows API validation errors and keeps the dialog available for correction', async () => {
    const user = userEvent.setup()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    apiMocks.updateApplication.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: { external_job_url: ['Enter a valid URL.'] },
      },
    })
    renderDialog()

    await user.type(
      screen.getByRole('textbox', { name: /external job posting url/i }),
      'https://invalid.example',
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Enter a valid URL.')).toBeInTheDocument()
    expect(screen.getByText('Review the highlighted fields and try again.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
