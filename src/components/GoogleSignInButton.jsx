import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../context/ThemeContext'
import { apiRequest } from '../services/api'
import './GoogleSignInButton.css'

export default function GoogleSignInButton({
  mode = 'signup', // 'signup' | 'signin'
  role = 'Citizen',
  onSuccess,
  onError,
}) {
  const [loading, setLoading] = useState(false)
  const [gisRendered, setGisRendered] = useState(false)
  const googleBtnContainerRef = useRef(null)
  const { resolvedTheme } = useTheme()

  const roleRef = useRef(role)
  roleRef.current = role

  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess

  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const activeClientId =
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    (typeof window !== 'undefined' ? localStorage.getItem('civicGoogleClientId') : '') ||
    '211200375921-kdrehhhd8vkh5s5bn2a8vmqkrj3ek5lm.apps.googleusercontent.com'

  // Initialize official Google Identity Services button
  useEffect(() => {
    if (!activeClientId || typeof window === 'undefined') return

    let cancelled = false
    let attempts = 0

    function initGis() {
      if (cancelled) return

      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: activeClientId,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
          })

          if (googleBtnContainerRef.current) {
            googleBtnContainerRef.current.innerHTML = ''
            window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
              theme: resolvedTheme === 'dark' ? 'filled_black' : 'outline',
              size: 'large',
              width: 380,
              text: mode === 'signup' ? 'signup_with' : 'signin_with',
              shape: 'rectangular',
              logo_alignment: 'left',
            })
            setGisRendered(true)
          }
        } catch (err) {
          console.warn('Google Identity Services notice:', err)
        }
      } else if (attempts < 25) {
        attempts++
        setTimeout(initGis, 200)
      }
    }

    initGis()

    return () => {
      cancelled = true
    }
  }, [activeClientId, mode, resolvedTheme])

  // Handles genuine Google ID Token credential
  async function handleGoogleCredentialResponse(response) {
    if (!response?.credential) {
      onErrorRef.current?.('No credential returned by Google')
      return
    }

    setLoading(true)
    try {
      const result = await apiRequest('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: response.credential,
          role: roleRef.current,
        }),
      })

      if (!result?.success || !result?.token || !result?.user) {
        throw new Error(result?.message || 'Google authentication failed')
      }

      const session = {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        avatar: result.user.avatar || '',
      }

      localStorage.setItem('civicToken', result.token)
      localStorage.setItem('civicSession', JSON.stringify(session))

      onSuccessRef.current?.(session)
    } catch (err) {
      onErrorRef.current?.(err.message || 'Google authentication failed')
    } finally {
      setLoading(false)
    }
  }

  // Fallback trigger if clicked before GIS iframe mounts
  function handleFallbackClick() {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt()
    } else {
      onErrorRef.current?.('Connecting to Google services... Please try again in a moment.')
    }
  }

  return (
    <div className="google-auth-container">
      {/* Official GIS Button Slot */}
      <div className="google-gis-wrapper">
        <div ref={googleBtnContainerRef} className="google-official-btn-slot" />
      </div>

      {/* Branded fallback button shown only while GIS iframe is mounting */}
      {!gisRendered && (
        <button
          type="button"
          className="google-signin-btn"
          onClick={handleFallbackClick}
          disabled={loading}
          aria-label={mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}
        >
          <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span className="google-btn-text">
            {loading
              ? 'Connecting to Google...'
              : mode === 'signup'
                ? 'Sign up with Google'
                : 'Sign in with Google'}
          </span>
        </button>
      )}

      {loading && (
        <div className="google-loading-indicator">
          <div className="google-spinner-mini" />
          <span>Authenticating with Google...</span>
        </div>
      )}
    </div>
  )
}
