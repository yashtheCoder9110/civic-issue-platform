import { useState, useEffect } from 'react'
import {
  Home as HomeIcon,
  LayoutDashboard,
  FilePlus2,
  Search,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  MapPin,
  CheckCircle2,
  Zap,
  Clock,
  Shield,
  Layers,
  Check,
} from 'lucide-react'

import Login from './pages/Login'
import Register from './pages/Register'
import CitizenDashboard from './pages/CitizenDashboard'
import ReportIssue from './pages/ReportIssue'
import TrackComplaints from './pages/TrackComplaints'
import OfficerDashboard from './pages/OfficerDashboard'
import Notifications from './components/Notifications'
import ThemeToggle from './components/ThemeToggle'
import { sound } from './utils/soundFx'
import { getApiBaseUrl, apiRequest } from './services/api'

function CivicConnectLogo({ size = 36 }) {
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
        <linearGradient id="ccGradNav" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="84" height="84" rx="22" fill="url(#ccGradNav)" />
      <path
        d="M28 66 L28 46 L42 34 L58 34 L72 46 L72 66 Z"
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx="50" cy="46" r="10" fill="#10b981" />
      <circle cx="50" cy="46" r="4" fill="#ffffff" />
      <path
        d="M36 68 L50 56 L64 68"
        fill="none"
        stroke="#ffffff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="74" cy="24" r="5" fill="#10b981" />
    </svg>
  )
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('civicSession') || 'null')
  } catch {
    return null
  }
}

function getDashboardPage(session) {
  return session?.role === 'Officer'
    ? 'Officer Dashboard'
    : 'Citizen Dashboard'
}

function App() {
  const [session, setSession] = useState(getSession)
  const [page, setPage] = useState('Home')

  useEffect(() => {
    function handleNavigate(e) {
      if (e.detail && typeof e.detail === 'string') {
        setPage(e.detail)
      }
    }
    window.addEventListener('civic-navigate-page', handleNavigate)
    return () => window.removeEventListener('civic-navigate-page', handleNavigate)
  }, [])

  function handleLogin(newSession) {
    setSession(newSession)
    setPage(getDashboardPage(newSession))
  }

  async function handleLogout() {
    try {
      const activeSession = session || JSON.parse(localStorage.getItem('civicSession') || 'null')
      const isGuest = Boolean(
        activeSession?.isGuest ||
        activeSession?.email?.startsWith('guest_') ||
        activeSession?.email?.includes('@civicconnect.local')
      )

      if (isGuest) {
        await apiRequest('/api/auth/guest-logout', {
          method: 'POST',
          body: JSON.stringify({ email: activeSession?.email, userId: activeSession?.id }),
        }).catch((err) => console.warn('Guest cleanup error:', err))
      }
    } catch (e) {
      console.warn('Logout cleanup error:', e)
    } finally {
      localStorage.removeItem('civicSession')
      localStorage.removeItem('civicToken')
      localStorage.removeItem('civicNotifications')
      localStorage.removeItem('complaints')
      localStorage.removeItem('cachedComplaints')
      sessionStorage.clear()
      setSession(null)
      setPage('Home')
      window.dispatchEvent(new Event('civic-complaints-updated'))
    }
  }

  function goToHome() {
    setPage('Home')
  }

  const isAuthenticated = Boolean(
    session?.email && session?.role
  )

  const isOfficer = session?.role === 'Officer'

  return (
    <div className="app">
      {/* Global Minimal Navbar */}
      <header className="navbar">
        <button
          className="nav-brand"
          onClick={goToHome}
          type="button"
          aria-label="Go to Home"
        >
          <span
            className="brand-icon"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              borderRadius: '50%',
              flexShrink: 0,
            }}
          >
            <CivicConnectLogo size={36} />
          </span>

          <span className="brand-text">
            Civic<span>Connect</span>
          </span>
        </button>

        <nav className="nav-links" aria-label="Main navigation">
          <button
            type="button"
            className={page === 'Home' ? 'active' : ''}
            onClick={() => {
              sound.click()
              goToHome()
            }}
          >
            <HomeIcon size={15} />
            <span>Home</span>
          </button>

          {isAuthenticated && (
            <>
              {isOfficer ? (
                <button
                  type="button"
                  className={page === 'Officer Dashboard' ? 'active' : ''}
                  onClick={() => {
                    sound.click()
                    setPage('Officer Dashboard')
                  }}
                >
                  <ShieldCheck size={15} />
                  <span>Officer Portal</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={page === 'Citizen Dashboard' ? 'active' : ''}
                    onClick={() => {
                      sound.click()
                      setPage('Citizen Dashboard')
                    }}
                  >
                    <LayoutDashboard size={15} />
                    <span>Dashboard</span>
                  </button>

                  <button
                    type="button"
                    className={page === 'Report Issue' ? 'active' : ''}
                    onClick={() => {
                      sound.click()
                      setPage('Report Issue')
                    }}
                  >
                    <FilePlus2 size={15} />
                    <span>Report Issue</span>
                  </button>
                </>
              )}

              <button
                type="button"
                className={page === 'Track Complaints' ? 'active' : ''}
                onClick={() => {
                  sound.click()
                  setPage('Track Complaints')
                }}
              >
                <Search size={15} />
                <span>Track Issues</span>
              </button>
            </>
          )}
        </nav>

        <div className="nav-actions">
          <ThemeToggle />

          {isAuthenticated ? (
            <>
              <Notifications />

              <div className="nav-user-profile" title={`${session.name} (${session.role})`}>
                {session?.avatar ? (
                  <img src={session.avatar} alt={session.name} className="nav-user-avatar" />
                ) : (
                  <div className="nav-user-initials">
                    {session.name ? session.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                )}
                <span className="nav-user-name">{session.name?.split(' ')[0]}</span>
                <span className={`nav-role-badge ${session.isGuest ? 'guest' : session.role?.toLowerCase()}`}>
                  {session.isGuest ? 'Guest' : session.role}
                </span>
              </div>

              <button
                className="logout-button"
                onClick={handleLogout}
                type="button"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <button
                className="secondary-button nav-auth-btn"
                type="button"
                onClick={() => setPage('Login')}
              >
                Sign In
              </button>

              <button
                className="primary-button nav-auth-btn"
                type="button"
                onClick={() => setPage('Register')}
              >
                Register
              </button>
            </>
          )}
        </div>
      </header>

      <main className="container">
        {page === 'Home' && (
          <div className="home-layout">
            <section className="hero modern-hero">
              <div className="hero-content">
                <div className="hero-pill">
                  <span className="hero-pill-dot" />
                  <span>LIVE CIVIC RESPONSE PLATFORM</span>
                </div>

                <h1>
                  Report Local Issues, <span>Fix Your City.</span>
                </h1>

                <p className="hero-lead">
                  Easily report potholes, water leaks, and broken streetlights with photos and GPS map location.
                  Direct municipal routing and transparent real-time tracking from report to verified resolution.
                </p>

                <div className="hero-actions">
                  {isAuthenticated ? (
                    <>
                      {!isOfficer && (
                        <button
                          className="primary-button hero-cta"
                          type="button"
                          onClick={() => setPage('Report Issue')}
                        >
                          <FilePlus2 size={18} />
                          Report an Issue →
                        </button>
                      )}
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setPage('Track Complaints')}
                      >
                        <Search size={18} />
                        Track Issues
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="primary-button hero-cta"
                        type="button"
                        onClick={() => setPage('Login')}
                      >
                        <Sparkles size={17} />
                        Get Started →
                      </button>

                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setPage('Register')}
                      >
                        Create Account
                      </button>

                      <button
                        className="guest-hero-button"
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch(`${getApiBaseUrl()}/api/auth/guest`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                            })
                            const data = await res.json()
                            if (res.ok && data.token) {
                              localStorage.setItem('civicToken', data.token)
                              localStorage.setItem('civicSession', JSON.stringify(data.user))
                              handleLogin(data.user)
                              return
                            }
                          } catch {}
                          const guestUser = {
                            id: 'guest_' + Date.now(),
                            name: 'Guest Citizen',
                            email: `guest_${Date.now()}@civicconnect.local`,
                            role: 'Citizen',
                            isGuest: true,
                          }
                          localStorage.setItem('civicSession', JSON.stringify(guestUser))
                          handleLogin(guestUser)
                        }}
                      >
                        <Zap size={16} />
                        Continue as a Guest
                      </button>
                    </>
                  )}
                </div>
              </div>
            </section>

            {/* How It Works 3-Step Grid */}
            <section className="home-features-section">
              <div className="section-header-center">
                <span className="feature-kicker">STREAMLINED CIVIC ACTION</span>
                <h2>How CivicConnect Works</h2>
                <p>Empowering citizens and municipal officers to collaborate with speed and accountability.</p>
              </div>

              <div className="home-steps-grid">
                <div className="step-card">
                  <span className="step-badge">01</span>
                  <div className="step-icon-box">📍</div>
                  <h3>Pin &amp; Snap</h3>
                  <p>Choose your exact location on the interactive map, attach photos, and specify problem category in under 30 seconds.</p>
                </div>

                <div className="step-card">
                  <span className="step-badge">02</span>
                  <div className="step-icon-box">⚡</div>
                  <h3>Intelligent Dispatch</h3>
                  <p>Issues are directly assigned to municipal teams with automated severity evaluation and duplicate clustering.</p>
                </div>

                <div className="step-card">
                  <span className="step-badge">03</span>
                  <div className="step-icon-box">✅</div>
                  <h3>Verified Resolution</h3>
                  <p>Follow live progress milestones. Officers upload photo proofs once work is inspected and resolved.</p>
                </div>
              </div>
            </section>

            {/* Live Resolution Spotlight Card */}
            <section className="home-spotlight-section">
              <div className="spotlight-card">
                <div className="spotlight-badge">
                  <Sparkles size={13} />
                  <span>REAL-TIME PLATFORM SHOWCASE</span>
                </div>
                <div className="spotlight-header">
                  <div>
                    <h3>Sample Ticket: Road Crater Repaired</h3>
                    <p className="spotlight-meta">
                      <MapPin size={14} /> Ward 4 &bull; Public Works Department &bull; Verified by Municipal Inspector
                    </p>
                  </div>
                  <span className="status-badge status-resolved">
                    <CheckCircle2 size={13} style={{ display: 'inline', marginRight: 4 }} />
                    Resolved in 18 hrs
                  </span>
                </div>
                <div className="spotlight-progress-bar">
                  <div className="spotlight-progress-fill" style={{ width: '100%' }}></div>
                </div>
                <div className="spotlight-stages">
                  <span className="stage-item completed">1. Reported</span>
                  <span className="stage-item completed">2. Reviewed</span>
                  <span className="stage-item completed">3. In Progress</span>
                  <span className="stage-item completed active">4. Resolved with Proof</span>
                </div>
              </div>
            </section>
          </div>
        )}

        {page === 'Login' && (
          <Login
            onLogin={handleLogin}
            onRegister={() => setPage('Register')}
          />
        )}

        {page === 'Register' && (
          <Register
            onRegister={() => setPage('Login')}
            onLogin={handleLogin}
          />
        )}

        {page !== 'Home' &&
          page !== 'Login' &&
          page !== 'Register' && (
            <div className="page-heading">
              <h1>{page}</h1>
            </div>
          )}

        {page === 'Citizen Dashboard' &&
          isAuthenticated &&
          !isOfficer && <CitizenDashboard />}

        {page === 'Report Issue' &&
          isAuthenticated &&
          !isOfficer && <ReportIssue />}

        {page === 'Track Complaints' &&
          isAuthenticated && <TrackComplaints />}

        {page === 'Officer Dashboard' &&
          isAuthenticated &&
          isOfficer && <OfficerDashboard />}
      </main>

      <footer className="footer">
        <p>
          © 2026 CivicConnect &bull; Community Problem Reporting Platform
        </p>
      </footer>
    </div>
  )
}

export default App
