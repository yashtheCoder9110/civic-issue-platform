
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
  KeyRound,
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
        <linearGradient id="ccGradLogin" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="50%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
        <linearGradient id="ccAccentLogin" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#67e8f9" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="84" height="84" rx="22" fill="url(#ccGradLogin)" />
      <path
        d="M28 66 L28 46 L42 34 L58 34 L72 46 L72 66 Z"
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx="50" cy="46" r="11" fill="url(#ccAccentLogin)" />
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

function Login({ onLogin, onRegister }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('Citizen')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    if (event) event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await apiRequest('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          role,
        }),
      })

      if (!result?.success || !result?.token || !result?.user) {
        throw new Error(
          result?.message || 'Login failed. Please check your credentials.'
        )
      }

      const session = {
        id: result.user.id || result.user._id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        isGuest: Boolean(result.user.isGuest),
      }

      localStorage.setItem('civicToken', result.token)
      localStorage.setItem('civicSession', JSON.stringify(session))

      onLogin(session)
    } catch (err) {
      setError(
        err.message ||
        'Something went wrong during login. Please try again.'
      )
    } finally {
      setLoading(false)
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
      onLogin(session)
    } catch (err) {
      setError(err.message || 'Could not start guest session.')
    } finally {
      setLoading(false)
    }
  }

  function fillDemoAccount(targetRole) {
    setError('')
    if (targetRole === 'Citizen') {
      setRole('Citizen')
      setEmail('citizen@civicconnect.gov')
      setPassword('citizen123')
    } else {
      setRole('Officer')
      setEmail('officer@civicconnect.gov')
      setPassword('officer123')
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
            OFFICIAL CIVIC PORTAL
          </span>
        </div>

        <h1>Welcome Back</h1>
        <p className="auth-subtitle">
          Sign in to report civic issues, track real-time repairs, or manage department dispatches.
        </p>

        {/* Segmented Account Type Tabs with Icons */}
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

        {/* Role Helper Info */}
        <div className="role-helper-note">
          {role === 'Citizen' ? (
            <span>Report road, water, waste & streetlight issues with GPS photos</span>
          ) : (
            <span>Inspect municipal queues, assign priority, & upload resolution proof</span>
          )}
        </div>

        {/* Demo Credentials Quick-Fill Toolbar */}
        <div className="demo-fill-strip">
          <span className="demo-fill-label">
            <KeyRound size={12} /> Quick Demo:
          </span>
          <button
            type="button"
            className="demo-chip-btn"
            onClick={() => fillDemoAccount('Citizen')}
            title="Auto-fill citizen login credentials"
          >
            Citizen Demo
          </button>
          <button
            type="button"
            className="demo-chip-btn"
            onClick={() => fillDemoAccount('Officer')}
            title="Auto-fill municipal officer login credentials"
          >
            Officer Demo
          </button>
        </div>

        <GoogleSignInButton
          mode="signin"
          role={role}
          onSuccess={onLogin}
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
          <span>or sign in with email</span>
        </div>

        <form onSubmit={handleSubmit} className="auth-form modern-form">
          <div className="form-group">
            <label htmlFor="login-email">Email Address</label>
            <div className="modern-input-wrapper">
              <Mail className="input-leading-icon" size={17} />
              <input
                id="login-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <div className="label-with-hint">
              <label htmlFor="login-password">Password</label>
            </div>
            <div className="modern-input-wrapper">
              <Lock className="input-leading-icon" size={17} />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
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
                <span>Signing In...</span>
              </>
            ) : (
              <>
                <span>Sign In as {role}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="auth-switch modern-auth-switch">
          <span>New to CivicConnect?</span>
          <button
            type="button"
            className="auth-switch-link"
            onClick={onRegister}
          >
            Create an account
          </button>
        </div>
      </div>
    </section>
  )
}

export default Login
