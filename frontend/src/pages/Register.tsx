import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getRegistrationErrors } from '../api/auth'
import { useAuth } from '../auth/AuthState'
import './Auth.css'

interface RegistrationErrors {
  username?: string
  password?: string
  passwordConfirm?: string
  form?: string
}

function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<RegistrationErrors>({})

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    if (password !== passwordConfirm) {
      setErrors({ passwordConfirm: 'Passwords do not match.' })
      return
    }

    setSubmitting(true)
    setErrors({})
    try {
      await register({
        username,
        password,
        password_confirm: passwordConfirm,
      })
      navigate('/login', {
        replace: true,
        state: {
          from,
          registrationSuccess: 'Account created. Sign in to continue.',
        },
      })
    } catch (requestError) {
      setErrors(getRegistrationErrors(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="auth-page" aria-labelledby="register-heading">
      <div className="auth-card auth-card--registration">
        <div className="auth-card__heading">
          <span className="auth-card__eyebrow">Get started</span>
          <h1 id="register-heading">Create your account</h1>
          <p>Use a username and a secure password to join SquareOne.</p>
        </div>

        {errors.form && (
          <div className="auth-message auth-message--error" role="alert">
            {errors.form}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Username</span>
            <input
              aria-describedby={errors.username ? 'username-error' : undefined}
              aria-invalid={Boolean(errors.username)}
              autoComplete="username"
              autoFocus
              name="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            {errors.username && <small id="username-error">{errors.username}</small>}
          </label>

          <label className="auth-field">
            <span>Password</span>
            <span className="auth-password">
              <input
                aria-describedby={errors.password ? 'password-error' : 'password-help'}
                aria-invalid={Boolean(errors.password)}
                autoComplete="new-password"
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
            {errors.password ? (
              <small id="password-error">{errors.password}</small>
            ) : (
              <small className="auth-field__hint" id="password-help">
                Use a strong password that is not similar to your username.
              </small>
            )}
          </label>

          <label className="auth-field">
            <span>Confirm password</span>
            <span className="auth-password">
              <input
                aria-describedby={errors.passwordConfirm ? 'confirmation-error' : undefined}
                aria-invalid={Boolean(errors.passwordConfirm)}
                autoComplete="new-password"
                name="password_confirm"
                required
                type={showConfirmation ? 'text' : 'password'}
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
              />
              <button
                className="auth-password__toggle"
                type="button"
                aria-label={showConfirmation ? 'Hide password confirmation' : 'Show password confirmation'}
                aria-pressed={showConfirmation}
                onClick={() => setShowConfirmation((visible) => !visible)}
              >
                {showConfirmation ? 'Hide' : 'Show'}
              </button>
            </span>
            {errors.passwordConfirm && (
              <small id="confirmation-error">{errors.passwordConfirm}</small>
            )}
          </label>

          <button className="auth-submit" disabled={submitting} type="submit">
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-card__alternate">
          Already have an account?{' '}
          <Link to="/login" state={{ from }}>Sign in</Link>
        </p>
      </div>
    </section>
  )
}

export default Register
