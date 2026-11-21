import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getApiErrorMessage } from '../api/auth'
import { useAuth } from '../auth/AuthState'
import './Auth.css'

interface LoginLocationState {
  from?: string
  registrationSuccess?: string
}

function safeDestination(from?: string) {
  return from?.startsWith('/') && !from.startsWith('//') ? from : '/applications'
}

function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as LoginLocationState
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)
    try {
      await login(username, password)
      navigate(safeDestination(state.from), { replace: true })
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          'Unable to sign in with those credentials.',
        ),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="auth-page" aria-labelledby="login-heading">
      <div className="auth-card">
        <div className="auth-card__heading">
          <span className="auth-card__eyebrow">Welcome back</span>
          <h1 id="login-heading">Sign in to SquareOne</h1>
          <p>Continue managing your saved jobs and applications.</p>
        </div>

        {state.registrationSuccess && (
          <div className="auth-message auth-message--success" role="status">
            {state.registrationSuccess}
          </div>
        )}
        {error && (
          <div className="auth-message auth-message--error" role="alert">
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Username</span>
            <input
              autoComplete="username"
              autoFocus
              name="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <span className="auth-password">
              <input
                autoComplete="current-password"
                name="password"
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                className="auth-password__toggle"
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>

          <button className="auth-submit" disabled={submitting} type="submit">
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth-card__alternate">
          New to SquareOne?{' '}
          <Link to="/register" state={{ from: state.from }}>Create an account</Link>
        </p>
      </div>
    </section>
  )
}

export default Login
