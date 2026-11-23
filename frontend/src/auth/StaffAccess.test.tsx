import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from './AuthState'
import { StaffRoute } from './ProtectedRoute'
import SquareOneNavigation from '../components/SquareOneNavigation'

function context(isStaff: boolean): AuthContextValue {
  return { isAuthenticated: true, login: vi.fn(), logout: vi.fn(), register: vi.fn(), status: 'authenticated', user: { id: 1, username: 'test-user', is_staff: isStaff } }
}

describe('staff frontend access', () => {
  it('redirects an ordinary authenticated user away from the admin route', () => {
    render(<MemoryRouter initialEntries={['/admin/jobs']}><AuthContext.Provider value={context(false)}><Routes><Route element={<StaffRoute />}><Route path="/admin/jobs" element={<h1>Administrator dashboard</h1>} /></Route><Route path="/jobs" element={<h1>Public jobs</h1>} /></Routes></AuthContext.Provider></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Public jobs' })).toBeInTheDocument()
  })

  it('shows Admin navigation only to staff and preserves the SquareOne brand', () => {
    const view = render(<MemoryRouter><AuthContext.Provider value={context(false)}><SquareOneNavigation /></AuthContext.Provider></MemoryRouter>)
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'SquareOne job search' })).toHaveTextContent('SquareOne')
    view.rerender(<MemoryRouter><AuthContext.Provider value={context(true)}><SquareOneNavigation /></AuthContext.Provider></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument()
  })
})
