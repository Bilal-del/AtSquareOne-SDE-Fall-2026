import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminJobs from './AdminJobs'

const api = vi.hoisted(() => ({
  archiveAdminJob: vi.fn(), createAdminJob: vi.fn(), getAdminJobs: vi.fn(),
  restoreAdminJob: vi.fn(), updateAdminJob: vi.fn(),
}))
vi.mock('../api/adminJobs', () => api)

const active = { id: 1, title: 'Software Intern', company: 'Fictional Labs', location: 'Remote', description: 'Build demo software.', created_at: '2026-11-20T12:00:00Z', deleted_at: null, status: 'active' }
const archived = { ...active, id: 2, title: 'Data Intern', deleted_at: '2026-11-22T12:00:00Z', status: 'archived' }
const page = { count: 2, next: null, previous: null, results: [active, archived], summary: { active: 1, archived: 1, total: 2 } }

describe('AdminJobs', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset())
    api.getAdminJobs.mockResolvedValue(page)
  })

  it('renders backend statistics, jobs, filters, and accessible mobile cards', async () => {
    render(<AdminJobs />)
    expect(await screen.findAllByText('Software Intern')).toHaveLength(2)
    expect(screen.getByLabelText('Job listing summary')).toHaveTextContent('Active listings1')
    expect(screen.getByLabelText('Job listing summary')).toHaveTextContent('Archived listings1')
    expect(screen.getByLabelText('Job listing summary')).toHaveTextContent('Total listings2')
    expect(screen.getByRole('combobox', { name: 'Filter by listing status' })).toBeInTheDocument()
  })

  it('sends search and status filters to the backend', async () => {
    const user = userEvent.setup(); render(<AdminJobs />)
    await screen.findAllByText('Software Intern')
    await user.type(screen.getByRole('searchbox', { name: 'Search jobs' }), 'data')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(api.getAdminJobs).toHaveBeenLastCalledWith('data', 'all', 1))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by listing status' }), 'archived')
    await waitFor(() => expect(api.getAdminJobs).toHaveBeenLastCalledWith('data', 'archived', 1))
  })

  it('validates and submits job creation', async () => {
    const user = userEvent.setup(); render(<AdminJobs />)
    await screen.findAllByText('Software Intern')
    await user.click(screen.getByRole('button', { name: '+ Create job' }))
    const submit = screen.getByRole('button', { name: 'Create and publish' })
    fireEvent.submit(submit.closest('form') as HTMLFormElement)
    expect(screen.getByRole('alert')).toHaveTextContent('Complete all required fields.')
    await user.type(screen.getByLabelText('Title *'), 'QA Intern')
    await user.type(screen.getByLabelText('Company *'), 'Test Company')
    await user.type(screen.getByLabelText('Location *'), 'Chicago, IL')
    await user.type(screen.getByLabelText('Description *'), 'Test fictional software.')
    api.createAdminJob.mockResolvedValue({ ...active, id: 3, title: 'QA Intern' })
    await user.click(submit)
    await waitFor(() => expect(api.createAdminJob).toHaveBeenCalledWith({ title: 'QA Intern', company: 'Test Company', location: 'Chicago, IL', description: 'Test fictional software.' }))
    expect(await screen.findByRole('status')).toHaveTextContent('created and published')
  })

  it('edits an existing job', async () => {
    const user = userEvent.setup(); render(<AdminJobs />)
    await screen.findAllByText('Software Intern')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    const title = screen.getByLabelText('Title *'); await user.clear(title); await user.type(title, 'Updated Intern')
    api.updateAdminJob.mockResolvedValue({ ...active, title: 'Updated Intern' })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.updateAdminJob).toHaveBeenCalledWith(1, expect.objectContaining({ title: 'Updated Intern' })))
  })

  it('confirms, cancels, and completes archival, then restores', async () => {
    const user = userEvent.setup(); render(<AdminJobs />)
    await screen.findAllByText('Software Intern')
    await user.click(screen.getAllByRole('button', { name: 'Archive' })[0])
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Existing applications and their history will remain intact')
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    expect(api.archiveAdminJob).not.toHaveBeenCalled()
    await user.click(screen.getAllByRole('button', { name: 'Archive' })[0])
    api.archiveAdminJob.mockResolvedValue({ ...active, status: 'archived' })
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Archive job' }))
    await waitFor(() => expect(api.archiveAdminJob).toHaveBeenCalledWith(1))
    api.restoreAdminJob.mockResolvedValue({ ...archived, deleted_at: null, status: 'active' })
    await user.click(screen.getAllByRole('button', { name: 'Restore' })[0])
    await waitFor(() => expect(api.restoreAdminJob).toHaveBeenCalledWith(2))
  })

  it('shows loading, empty, and API failure states', async () => {
    let resolvePage: (value: typeof page) => void = () => undefined
    api.getAdminJobs.mockReturnValueOnce(new Promise((resolve) => { resolvePage = resolve }))
    const view = render(<AdminJobs />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading job listings')
    resolvePage({ ...page, count: 0, results: [] }); expect(await screen.findByText('No job listings found')).toBeInTheDocument()
    view.unmount(); api.getAdminJobs.mockRejectedValueOnce(new Error('offline')); render(<AdminJobs />)
    expect(await screen.findByRole('alert')).toHaveTextContent('offline')
  })
})
