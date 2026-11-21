import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/AuthState'
import SaveJobButton from './SaveJobButton'
import { makeApplication, makeDuplicate } from '../test/fixtures/applications'

const apiMocks = vi.hoisted(() => ({
  createApplication: vi.fn(),
  findApplicationDuplicates: vi.fn(),
}))

vi.mock('../api/applications', () => apiMocks)

function renderButton() {
  render(
    <MemoryRouter>
      <AuthContext.Provider value={{
        isAuthenticated: true,
        login: vi.fn(),
        logout: vi.fn(),
        register: vi.fn(),
        status: 'authenticated',
        user: null,
      }}>
        <SaveJobButton jobId={42} />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('SaveJobButton duplicate confirmation', () => {
  beforeEach(() => {
    apiMocks.createApplication.mockReset()
    apiMocks.findApplicationDuplicates.mockReset()
  })

  it('lets a user cancel when an archived duplicate is found', async () => {
    const user = userEvent.setup()
    apiMocks.findApplicationDuplicates.mockResolvedValue([
      makeDuplicate({
        archived_at: '2026-11-20T12:00:00Z',
        job: 42,
        source: 'squareone',
        status: 'accepted',
      }),
    ])
    renderButton()

    await user.click(screen.getByRole('button', { name: 'Save to tracker' }))

    expect(await screen.findByText('Potential duplicate found')).toBeInTheDocument()
    expect(screen.getByText(/Accepted · Archived/)).toBeInTheDocument()
    expect(apiMocks.createApplication).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('Save cancelled.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save to tracker' })).toBeInTheDocument()
  })

  it('lets a user continue saving despite a duplicate warning', async () => {
    const user = userEvent.setup()
    apiMocks.findApplicationDuplicates.mockResolvedValue([
      makeDuplicate({ job: 42, source: 'squareone', status: 'interviewing' }),
    ])
    apiMocks.createApplication.mockResolvedValue(makeApplication({
      job: 42,
      source: 'squareone',
    }))
    renderButton()

    await user.click(screen.getByRole('button', { name: 'Save to tracker' }))
    await user.click(await screen.findByRole('button', { name: 'Continue saving' }))

    await waitFor(() => expect(apiMocks.createApplication).toHaveBeenCalledWith({
      job: 42,
      status: 'saved',
    }))
    expect(await screen.findByText('Saved to your tracker')).toBeInTheDocument()
    expect(screen.getByText('Status: Saved')).toBeInTheDocument()
  })

  it('saves immediately when no duplicate exists', async () => {
    const user = userEvent.setup()
    apiMocks.findApplicationDuplicates.mockResolvedValue([])
    apiMocks.createApplication.mockResolvedValue(makeApplication({
      job: 42,
      source: 'squareone',
    }))
    renderButton()

    await user.click(screen.getByRole('button', { name: 'Save to tracker' }))

    await waitFor(() => expect(apiMocks.createApplication).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Job saved to your application tracker.')).toBeInTheDocument()
  })

  it('keeps Continue available when duplicate lookup fails', async () => {
    const user = userEvent.setup()
    apiMocks.findApplicationDuplicates.mockRejectedValue(new Error('offline'))
    apiMocks.createApplication.mockResolvedValue(makeApplication({
      job: 42,
      source: 'squareone',
    }))
    renderButton()

    await user.click(screen.getByRole('button', { name: 'Save to tracker' }))
    expect(await screen.findByText(/Duplicate check is unavailable/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue saving' }))

    await waitFor(() => expect(apiMocks.createApplication).toHaveBeenCalledTimes(1))
  })
})
