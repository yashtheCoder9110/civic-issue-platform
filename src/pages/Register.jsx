
import { useState } from 'react'
import {
  Mail,
  Lock,
  User,
  Shield,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  AlertCircle,
  Loader2,
  CheckCircle,
} from 'lucide-react'
import { apiRequest } from '../services/api'
import GoogleSignInButton from '../components/GoogleSignInButton'

function CivicConnectLogo({ size = 56 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="CivicConnect logo"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="ccGradReg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="50%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
        <linearGradient id="ccAccentReg" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#67e8f9" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="84" height="84" rx="22" fill="url(#ccGradReg)" />
      <path
        d="M28 66 L28 46 L42 34 L58 34 L72 46 L72 66 Z"
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx="50" cy="46" r="11" fill="url(#ccAccentReg)" />
      <circle cx="50" cy="46" r="4.5" fill="#ffffff" />
      <path
        d="M36 68 L50 56 L64 68"
        fill="none"
        stroke="#ffffff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="74" cy="24" r="5.5" fill="#34d399" />
      <circle cx="74" cy="24" r="2.5" fill="#ffffff" />
    </svg>
  )
}

function Register({ onRegister, onLogin }) {
  const [role, setRole] = useState('Citizen')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    if (event) event.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Your password must contain at least 8 characters.')
      return
    }

    setLoading(true)

    try {
      const result = await apiRequest('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
        }),
      })

      if (!result || result.success === false) {
        throw new Error(
          result?.message || 'Could not create your account.'
        )
      }

      if (result.token && result.user) {
        const session = {
          id: result.user.id || result.user._id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role,
          isGuest: Boolean(result.user.isGuest),
        }
        localStorage.setItem('civicToken', result.token)
        localStorage.setItem('civicSession', JSON.stringify(session))
        if (onLogin) {
          onLogin(session)
          return
        }
      }

      onRegister()
    } catch (err) {
      setError(
        err.message || 'Could not create your account. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  function handleGoogleSuccess(session) {
    if (onLogin) {
      onLogin(session)
    } else {
      onRegister()
    }
  }

  async function handleGuestLogin() {
    setError('')
    setLoading(true)
    try {
      const result = await apiRequest('/api/auth/guest', {
        method: 'POST',
      })

      if (!result?.success || !result?.token || !result?.user) {
        throw new Error(result?.message || 'Guest login failed. Please try again.')
      }

      const session = {
        id: result.user.id || result.user._id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        isGuest: true,
      }

      localStorage.setItem('civicToken', result.token)
      localStorage.setItem('civicSession', JSON.stringify(session))
      if (onLogin) {
        onLogin(session)
      }
    } catch (err) {
      setError(err.message || 'Could not start guest session.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-card-backdrop"></div>
      <div className="auth-card modern-auth-card">
        <div className="auth-header-visual">
          <div className="auth-logo-aura">
            <CivicConnectLogo size={56} />
          </div>
          <span className="auth-badge-pill">
            <Sparkles size={11} className="inline-sparkle" />
            {role === 'Officer' ? 'OFFICER ONBOARDING' : 'CITIZEN REGISTRATION'}
          </span>
        </div>

        <h1>{role === 'Officer' ? 'Join Municipal Response' : 'Create Your Account'}</h1>

        <p className="auth-subtitle">
          {role === 'Officer'
            ? 'Join the municipal team to verify reports, assign field teams, and log resolution proofs.'
            : 'Join your local community to report issues, track repairs, and improve neighborhood infrastructure.'}
        </p>

        {/* Segmented Account Type Tabs */}
        <div className="auth-role-tabs modern-role-tabs" role="tablist" aria-label="Select Account Type">
          <button
            type="button"
            role="tab"
            aria-selected={role === 'Citizen'}
            className={`auth-role-tab ${role === 'Citizen' ? 'active' : ''}`}
            onClick={() => setRole('Citizen')}
          >
            <User size={15} />
            <span>Citizen</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={role === 'Officer'}
            className={`auth-role-tab ${role === 'Officer' ? 'active' : ''}`}
            onClick={() => setRole('Officer')}
          >
            <Shield size={15} />
            <span>Municipal Officer</span>
          </button>
        </div>

        <GoogleSignInButton
          mode="signup"
          role={role}
          onSuccess={handleGoogleSuccess}
          onError={(msg) => setError(msg)}
        />

        {role === 'Citizen' && (
          <div className="guest-login-wrapper">
            <button
              type="button"
              className="guest-login-btn modern-guest-btn"
              onClick={handleGuestLogin}
              disabled={loading}
            >
              <Sparkles size={14} />
              Continue as a Guest
            </button>
          </div>
        )}

        <div className="auth-divider">
          <span>or register with email</span>
        </div>

        <form className="auth-form modern-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="register-name">Full Name</label>
            <div className="modern-input-wrapper">
              <User className="input-leading-icon" size={17} />
              <input
                id="register-name"
                type="text"
                placeholder={role === 'Officer' ? 'e.g. Officer Rajesh Sharma' : 'e.g. Priya Patel'}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                autoComplete="name"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="register-email">Email Address</label>
            <div className="modern-input-wrapper">
              <Mail className="input-leading-icon" size={17} />
              <input
                id="register-email"
                type="email"
                placeholder={role === 'Officer' ? 'officer@civicconnect.gov' : 'you@example.com'}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <div className="label-with-hint">
              <label htmlFor="register-password">Password</label>
              <span className="field-hint">Min. 8 chars</span>
            </div>
            <div className="modern-input-wrapper">
              <Lock className="input-leading-icon" size={17} />
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Create a secure password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="input-trailing-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="auth-error-banner" role="alert">
              <AlertCircle size={16} className="error-icon" />
              <span>{error}</span>
            </div>
          )}

          <button
            className="primary-button auth-submit modern-submit-btn"
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spin-icon" />
                <span>Creating Account...</span>
              </>
            ) : (
              <>
                <span>{role === 'Officer' ? 'Register as Officer' : 'Create Free Account'}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="auth-switch modern-auth-switch">
          <span>Already have an account?</span>
          <button
            type="button"
            className="auth-switch-link"
            onClick={onRegister}
          >
            Back to Login
          </button>
        </div>
      </div>
    </section>
  )
}

export default Register
