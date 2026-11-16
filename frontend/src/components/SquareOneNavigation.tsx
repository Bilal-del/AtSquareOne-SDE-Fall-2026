import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { getApiErrorMessage } from '../api/auth'
import { useAuth } from '../auth/AuthState'

function getInitials(username: string) {
  const parts = username.trim().split(/[\s._-]+/).filter(Boolean)
  if (parts.length > 1) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return username.slice(0, 2).toUpperCase()
}

function SquareOneNavigation() {
  const { user, status, logout } = useAuth()
  const navigate = useNavigate()
  const accountRef = useRef<HTMLDivElement>(null)
  const accountTriggerRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const drawerCloseRef = useRef<HTMLButtonElement>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  const getNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'site-nav__link site-nav__link--active' : 'site-nav__link'

  const closeAccountAndRestoreFocus = useCallback(() => {
    setAccountOpen(false)
    accountTriggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!accountOpen) return

    const mobileDrawerOpen = window.matchMedia('(max-width: 768px)').matches
    if (mobileDrawerOpen) drawerCloseRef.current?.focus()

    function dismissOnPointerDown(event: MouseEvent) {
      if (!accountRef.current?.contains(event.target as Node)) {
        setAccountOpen(false)
      }
    }

    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeAccountAndRestoreFocus()
        return
      }

      if (event.key !== 'Tab' || !mobileDrawerOpen || !drawerRef.current) return
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('mousedown', dismissOnPointerDown)
    document.addEventListener('keydown', dismissOnEscape)
    return () => {
      document.removeEventListener('mousedown', dismissOnPointerDown)
      document.removeEventListener('keydown', dismissOnEscape)
    }
  }, [accountOpen, closeAccountAndRestoreFocus])

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    setLogoutError(null)
    try {
      await logout()
      setAccountOpen(false)
      navigate('/jobs', { replace: true })
    } catch (error) {
      setLogoutError(
        getApiErrorMessage(
          error,
          'Logout could not be completed. Your server session may still be active.',
        ),
      )
    } finally {
      setLoggingOut(false)
    }
  }

  const accountContent = user && (
    <>
      <span className="account-card__avatar" aria-hidden="true">
        {getInitials(user.username)}
      </span>
      <span className="account-card__identity">
        <small>Signed in as</small>
        <strong>{user.username}</strong>
      </span>
    </>
  )

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link
          className="site-brand"
          to="/jobs"
          aria-label="SquareOne job search"
          onClick={() => setAccountOpen(false)}
        >
          <span className="site-brand__mark" aria-hidden="true">■</span>
          SquareOne
        </Link>

        <span className="site-header__eyebrow">Career Discovery</span>

        <nav className="site-nav" aria-label="Primary navigation">
          <NavLink className={getNavLinkClass} to="/jobs" onClick={() => setAccountOpen(false)}>
            Find jobs
          </NavLink>
          <NavLink className={getNavLinkClass} to="/applications" onClick={() => setAccountOpen(false)}>
            Application tracker
          </NavLink>
        </nav>

        {status === 'authenticated' && user ? (
          <div className="site-account" ref={accountRef}>
            <button
              ref={accountTriggerRef}
              className="site-account__trigger"
              type="button"
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              aria-label={`${accountOpen ? 'Close' : 'Open'} account menu for ${user.username}`}
              onClick={() => {
                setLogoutError(null)
                setAccountOpen((open) => !open)
              }}
            >
              <span className="site-account__username">{user.username}</span>
              <span className="site-workspace__avatar" aria-hidden="true">
                {getInitials(user.username)}
              </span>
            </button>

            {accountOpen && (
              <div className="account-dropdown" role="menu">
                <div className="account-card">{accountContent}</div>
                {logoutError && <p className="account-error" role="alert">{logoutError}</p>}
                <button
                  className="account-logout"
                  role="menuitem"
                  type="button"
                  disabled={loggingOut}
                  onClick={handleLogout}
                >
                  {loggingOut ? 'Logging out…' : 'Log out'}
                </button>
              </div>
            )}

            {accountOpen && (
              <div
                className="account-drawer-backdrop"
                role="presentation"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) closeAccountAndRestoreFocus()
                }}
              >
                <aside
                  ref={drawerRef}
                  className="account-drawer"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Account menu"
                >
                  <div className="account-drawer__heading">
                    <strong>Account</strong>
                    <button
                      ref={drawerCloseRef}
                      className="account-drawer__close"
                      type="button"
                      aria-label="Close account menu"
                      onClick={closeAccountAndRestoreFocus}
                    >
                      ×
                    </button>
                  </div>
                  <div className="account-card account-card--drawer">{accountContent}</div>
                  {logoutError && <p className="account-error" role="alert">{logoutError}</p>}
                  <button
                    className="account-logout account-logout--drawer"
                    type="button"
                    disabled={loggingOut}
                    onClick={handleLogout}
                  >
                    {loggingOut ? 'Logging out…' : 'Log out'}
                  </button>
                </aside>
              </div>
            )}
          </div>
        ) : status === 'anonymous' ? (
          <div className="site-auth-links">
            <Link className="site-auth-links__login" to="/login">Sign in</Link>
            <Link className="site-auth-links__register" to="/register">Create account</Link>
          </div>
        ) : (
          <span className="site-account-loading" aria-label="Loading account" />
        )}
      </div>
    </header>
  )
}

export default SquareOneNavigation
