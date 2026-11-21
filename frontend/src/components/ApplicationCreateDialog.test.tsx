import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ApplicationCreateDialog from './ApplicationCreateDialog'
import { makeApplication, makeDuplicate } from '../test/fixtures/applications'

const apiMocks = vi.hoisted(() => ({
  createApplication: vi.fn(),
  findApplicationDuplicates: vi.fn(),
}))

vi.mock('../api/applications', () => apiMocks)

function renderDialog() {
  const onClose = vi.fn()
  const onCreated = vi.fn()
  render(<ApplicationCreateDialog onClose={onClose} onCreated={onCreated} />)
  return { onClose, onCreated }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe('ApplicationCreateDialog', () => {
  beforeEach(() => {
    apiMocks.createApplication.mockReset()
    apiMocks.findApplicationDuplicates.mockReset()
    apiMocks.findApplicationDuplicates.mockResolvedValue([])
  })

  it('requires a nonblank job title and company name', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByRole('textbox', { name: /job title/i }), '   ')
    await user.type(screen.getByRole('textbox', { name: /company name/i }), '   ')
    await user.click(screen.getByRole('button', { name: 'Save application' }))

    expect(screen.getByText('Job title is required.')).toBeInTheDocument()
    expect(screen.getByText('Company name is required.')).toBeInTheDocument()
    expect(apiMocks.createApplication).not.toHaveBeenCalled()
  })

  it('clears required-field errors as corrected values become valid', async () => {
    const user = userEvent.setup()
    renderDialog()

    const title = screen.getByRole('textbox', { name: /job title/i })
    const company = screen.getByRole('textbox', { name: /company name/i })
    await user.click(screen.getByRole('button', { name: 'Save application' }))

    await user.type(title, 'Software Engineer')
    expect(screen.queryByText('Job title is required.')).not.toBeInTheDocument()
    expect(screen.getByText('Company name is required.')).toBeInTheDocument()
    expect(screen.getByText('Enter the required application information.')).toBeInTheDocument()

    await user.type(company, 'Example Corp')
    expect(screen.queryByText('Company name is required.')).not.toBeInTheDocument()
    expect(screen.queryByText('Enter the required application information.')).not.toBeInTheDocument()
  })

  it('submits blank optional fields with Saved selected and returns an active application', async () => {
    const user = userEvent.setup()
    const created = makeApplication({ archived_at: null, status: 'saved' })
    apiMocks.createApplication.mockResolvedValue(created)
    const { onCreated } = renderDialog()

    await user.type(screen.getByRole('textbox', { name: /job title/i }), 'Software Engineer')
    await user.type(screen.getByRole('textbox', { name: /company name/i }), 'Example Corp')
    expect(screen.getByRole('combobox', { name: /application status/i })).toHaveValue('saved')
    await user.click(screen.getByRole('button', { name: 'Save application' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
    expect(created.archived_at).toBeNull()
    expect(apiMocks.createApplication).toHaveBeenCalledWith({
      applied_date: null,
      company: 'Example Corp',
      employment_type: '',
      external_job_url: '',
      job_title: 'Software Engineer',
      location: '',
      notes: '',
      status: 'saved',
      work_arrangement: '',
    })
  })

  it('submits all extended application fields', async () => {
    const user = userEvent.setup()
    const created = makeApplication({
      applied_date: '2026-11-20',
      employment_type: 'full_time',
      external_job_url: 'https://jobs.example.test/123',
      location: 'Chicago, IL',
      notes: 'Met the team.',
      status: 'interviewing',
      work_arrangement: 'hybrid',
    })
    apiMocks.createApplication.mockResolvedValue(created)
    renderDialog()

    await user.type(screen.getByRole('textbox', { name: /job title/i }), created.job_title)
    await user.type(screen.getByRole('textbox', { name: /company name/i }), created.company)
    await user.type(screen.getByRole('textbox', { name: /job location/i }), created.location)
    fireEvent.change(screen.getByLabelText(/application date/i), {
      target: { value: created.applied_date },
    })
    await user.selectOptions(screen.getByRole('combobox', { name: /application status/i }), 'interviewing')
    await user.selectOptions(screen.getByRole('combobox', { name: /work arrangement/i }), 'hybrid')
    await user.selectOptions(screen.getByRole('combobox', { name: /employment type/i }), 'full_time')
    await user.type(screen.getByRole('textbox', { name: /external job posting url/i }), created.external_job_url)
    await user.type(screen.getByRole('textbox', { name: /personal notes/i }), created.notes)
    await user.click(screen.getByRole('button', { name: 'Save application' }))

    await waitFor(() => expect(apiMocks.createApplication).toHaveBeenCalledWith({
      applied_date: '2026-11-20',
      company: 'Example Corp',
      employment_type: 'full_time',
      external_job_url: 'https://jobs.example.test/123',
      job_title: 'Software Engineer',
      location: 'Chicago, IL',
      notes: 'Met the team.',
      status: 'interviewing',
      work_arrangement: 'hybrid',
    }))
  })

  it('shows backend validation errors without closing the form', async () => {
    const user = userEvent.setup()
    apiMocks.createApplication.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: { company: ['Company name is invalid.'] },
      },
    })
    renderDialog()

    await user.type(screen.getByRole('textbox', { name: /job title/i }), 'Engineer')
    await user.type(screen.getByRole('textbox', { name: /company name/i }), 'Example')
    await user.click(screen.getByRole('button', { name: 'Save application' }))

    expect(await screen.findByText('Company name is invalid.')).toBeInTheDocument()
    expect(screen.getByText('Review the highlighted fields and try again.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('debounces normalized duplicate lookups and displays archived status details', async () => {
    vi.useFakeTimers()
    apiMocks.findApplicationDuplicates.mockResolvedValue([
      makeDuplicate({ archived_at: '2026-11-18T10:00:00Z', status: 'accepted' }),
    ])
    renderDialog()

    const title = screen.getByRole('textbox', { name: /job title/i })
    const company = screen.getByRole('textbox', { name: /company name/i })
    fireEvent.change(title, { target: { value: '  SOFTWARE' } })
    fireEvent.change(title, { target: { value: '  SOFTWARE   ENGINEER  ' } })
    fireEvent.change(company, { target: { value: ' example corp ' } })

    expect(apiMocks.findApplicationDuplicates).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(399)
      await Promise.resolve()
    })
    expect(apiMocks.findApplicationDuplicates).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })

    expect(apiMocks.findApplicationDuplicates).toHaveBeenCalledTimes(1)
    expect(apiMocks.findApplicationDuplicates).toHaveBeenCalledWith(
      { company: 'example corp', job_title: 'SOFTWARE   ENGINEER' },
      expect.any(AbortSignal),
    )
    expect(screen.getByText('Potential duplicate found')).toBeInTheDocument()
    expect(screen.getByText(/Accepted · Archived/)).toBeInTheDocument()
  })

  it('does not allow a stale duplicate response to replace a newer result', async () => {
    vi.useFakeTimers()
    const first = deferred<ReturnType<typeof makeDuplicate>[]>()
    const second = deferred<ReturnType<typeof makeDuplicate>[]>()
    apiMocks.findApplicationDuplicates
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    renderDialog()

    fireEvent.change(screen.getByRole('textbox', { name: /job title/i }), {
      target: { value: 'Old Role' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /company name/i }), {
      target: { value: 'Example Corp' },
    })
    await act(async () => {
      vi.advanceTimersByTime(400)
      await Promise.resolve()
    })

    fireEvent.change(screen.getByRole('textbox', { name: /job title/i }), {
      target: { value: 'New Role' },
    })
    await act(async () => {
      vi.advanceTimersByTime(400)
      await Promise.resolve()
    })

    await act(async () => {
      second.resolve([makeDuplicate({ id: 2, job_title: 'New Role' })])
      await second.promise
    })
    expect(screen.getByText(/New Role at Example Corp/)).toBeInTheDocument()

    await act(async () => {
      first.resolve([makeDuplicate({ job_title: 'Old Role' })])
      await first.promise
    })
    expect(screen.queryByText(/Old Role at Example Corp/)).not.toBeInTheDocument()
    expect(screen.getByText(/New Role at Example Corp/)).toBeInTheDocument()
  })

  it('allows submission when duplicate lookup fails', async () => {
    vi.useFakeTimers()
    const created = makeApplication()
    apiMocks.findApplicationDuplicates.mockRejectedValueOnce(
      new Error('lookup unavailable'),
    )
    apiMocks.createApplication.mockResolvedValue(created)
    const { onCreated } = renderDialog()

    fireEvent.change(screen.getByRole('textbox', { name: /job title/i }), {
      target: { value: 'Software Engineer' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /company name/i }), {
      target: { value: 'Example Corp' },
    })
    await act(async () => {
      vi.advanceTimersByTime(400)
      await Promise.resolve()
    })
    expect(screen.getByText(/Duplicate check is temporarily unavailable/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save application' }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(onCreated).toHaveBeenCalledWith(created)
  })

  it('allows submission despite a duplicate warning', async () => {
    vi.useFakeTimers()
    const created = makeApplication()
    apiMocks.findApplicationDuplicates.mockResolvedValue([makeDuplicate()])
    apiMocks.createApplication.mockResolvedValue(created)
    const { onCreated } = renderDialog()

    fireEvent.change(screen.getByRole('textbox', { name: /job title/i }), {
      target: { value: 'Software Engineer' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /company name/i }), {
      target: { value: 'Example Corp' },
    })
    await act(async () => {
      vi.advanceTimersByTime(400)
      await Promise.resolve()
    })
    expect(screen.getByText('Potential duplicate found')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save application' }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(onCreated).toHaveBeenCalledWith(created)
  })
})
