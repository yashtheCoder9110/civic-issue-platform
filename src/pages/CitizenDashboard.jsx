import { useEffect, useState } from 'react'
import {
  FileText,
  Clock,
  Activity,
  CheckCircle2,
  Inbox,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import ComplaintStatsCharts from '../components/ComplaintStatsCharts'
import { apiRequest } from '../services/api'

const TIMELINE_STAGES = [
  { label: 'Reported', description: 'Complaint submitted' },
  { label: 'Reviewed', description: 'Awaiting or undergoing review' },
  { label: 'In Progress', description: 'Work is underway' },
  { label: 'Resolved', description: 'Issue marked resolved' },
]

function getSession() {
  try {
    return JSON.parse(
      localStorage.getItem('civicSession') || 'null'
    )
  } catch {
    return null
  }
}

function getStatusClass(status) {
  const value = String(status || 'Submitted')
    .toLowerCase()
    .replace(/\s+/g, '-')

  return `status-badge status-${value}`
}

function getTimelineState(status) {
  const normalized = String(status || 'Submitted')
    .trim()
    .toLowerCase()

  if (normalized === 'rejected') {
    return {
      rejected: true,
      activeStage: -1,
      label: 'Rejected',
      description: 'This complaint was rejected. Contact the relevant officer if you need clarification.',
    }
  }

  if (normalized === 'resolved') {
    return {
      rejected: false,
      activeStage: 3,
      label: 'Resolved',
      description: 'The complaint has been marked as resolved.',
    }
  }

  if (['in progress', 'assigned'].includes(normalized)) {
    return {
      rejected: false,
      activeStage: 2,
      label: normalized === 'assigned' ? 'Assigned' : 'In Progress',
      description: normalized === 'assigned'
        ? 'The complaint has been assigned for action.'
        : 'Work on the complaint is underway.',
    }
  }

  if (['pending', 'ai verified'].includes(normalized)) {
    return {
      rejected: false,
      activeStage: 1,
      label: normalized === 'ai verified' ? 'AI Verified' : 'Pending',
      description: normalized === 'ai verified'
        ? 'Initial automated checks are complete. Officer review may still be needed.'
        : 'The complaint is waiting for further action.',
    }
  }

  return {
    rejected: false,
    activeStage: 0,
    label: 'Submitted',
    description: 'Your complaint has been recorded and is awaiting review.',
  }
}

function ComplaintTimeline({ status }) {
  const timeline = getTimelineState(status)

  return (
    <div className="complaint-timeline">
      <div className="timeline-heading">
        <span className="timeline-eyebrow">PROGRESS TRACKER</span>
        <span
          className={`timeline-current ${
            timeline.rejected ? 'timeline-rejected' : ''
          }`}
        >
          {timeline.label}
        </span>
      </div>

      {timeline.rejected ? (
        <div className="timeline-rejection">
          <span className="timeline-rejection-icon" aria-hidden="true">
            !
          </span>
          <p>{timeline.description}</p>
        </div>
      ) : (
        <>
          <div
            className="timeline-stages"
            aria-label={`Complaint progress: ${timeline.label}`}
          >
            {TIMELINE_STAGES.map((stage, index) => {
              const isComplete = index < timeline.activeStage
              const isCurrent = index === timeline.activeStage
              const stageClass = isComplete
                ? 'timeline-stage timeline-complete'
                : isCurrent
                  ? 'timeline-stage timeline-current-stage'
                  : 'timeline-stage'

              return (
                <div className={stageClass} key={stage.label}>
                  <div className="timeline-marker">
                    {isComplete ? '✓' : index + 1}
                  </div>
                  <span className="timeline-stage-label">
                    {stage.label}
                  </span>
                </div>
              )
            })}
          </div>

          <p className="timeline-description">
            {timeline.description}
          </p>
        </>
      )}
    </div>
  )
}

function CitizenDashboard() {
  const [session] = useState(() => getSession())
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (session?.role === 'Officer') {
      window.dispatchEvent(new CustomEvent('civic-navigate-page', { detail: 'Officer Dashboard' }))
    }
  }, [session])

  useEffect(() => {
    let cancelled = false

    async function loadComplaints() {
      setLoading(true)
      setError('')

      try {
        if (!session?.email) {
          setComplaints([])
          setError('Please log in to view your complaints.')
          return
        }

        const response = await apiRequest('/api/issues')

        if (!response.success || !Array.isArray(response.complaints)) {
          throw new Error('The server returned an unexpected response.')
        }

        // Keep the existing account-based display filter.
        // The backend must enforce ownership for security.
        const email = session.email.trim().toLowerCase()

        const myComplaints = response.complaints.filter(
          (complaint) =>
            String(complaint.submittedByEmail || '')
              .trim()
              .toLowerCase() === email
        )

        if (!cancelled) {
          setComplaints(myComplaints)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.message ||
              'Unable to load complaints. Please check your backend.'
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadComplaints()

    function refreshComplaints() {
      loadComplaints()
    }

    window.addEventListener('focus', refreshComplaints)
    window.addEventListener(
      'civic-complaints-updated',
      refreshComplaints
    )

    return () => {
      cancelled = true
      window.removeEventListener('focus', refreshComplaints)
      window.removeEventListener(
        'civic-complaints-updated',
        refreshComplaints
      )
    }
  }, [])

  const total = complaints.length

  const resolved = complaints.filter(
    (item) =>
      String(item.status || '').toLowerCase() === 'resolved'
  ).length

  const inProgress = complaints.filter((item) =>
    ['in progress', 'assigned'].includes(
      String(item.status || '').toLowerCase()
    )
  ).length

  const pending = complaints.filter((item) =>
    ['submitted', 'ai verified', 'pending'].includes(
      String(item.status || '').toLowerCase()
    )
  ).length

  const recentComplaints = [...complaints]
    .sort((a, b) => {
      const dateA = new Date(a.createdAt || a.date || 0).getTime()
      const dateB = new Date(b.createdAt || b.date || 0).getTime()
      return dateB - dateA
    })
    .slice(0, 5)

  return (
    <div className="citizen-dashboard">
      <section className="dashboard-welcome">
        <div>
          <h2>Welcome back, {session?.name ? session.name.split(' ')[0] : 'Citizen'} 👋</h2>
          <p>
            Track your submitted issues and local community repair progress in real time.
          </p>
        </div>

        <div className="welcome-icon" aria-hidden="true">
          <svg
            width="76"
            height="76"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 10L12 4L21 10" />
            <path d="M5 10V20H19V10" />
            <path d="M9 20V14H15V20" />
            <path d="M2 21H22" />
          </svg>
        </div>
      </section>

      {error && (
        <div className="citizen-content-card" role="alert">
          <p>{error}</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>
      )}

      <section className="citizen-stats">
        <article className="citizen-stat-card stat-blue">
          <div className="stat-icon">
            <FileText size={22} />
          </div>
          <p>Total Complaints</p>
          <h3>{loading ? '—' : total}</h3>
          <span>Reports submitted by you</span>
        </article>

        <article className="citizen-stat-card stat-orange">
          <div className="stat-icon">
            <Clock size={22} />
          </div>
          <p>Pending</p>
          <h3>{loading ? '—' : pending}</h3>
          <span>Awaiting action</span>
        </article>

        <article className="citizen-stat-card stat-purple">
          <div className="stat-icon">
            <Activity size={22} />
          </div>
          <p>In Progress</p>
          <h3>{loading ? '—' : inProgress}</h3>
          <span>Being worked on</span>
        </article>

        <article className="citizen-stat-card stat-green">
          <div className="stat-icon">
            <CheckCircle2 size={22} />
          </div>
          <p>Resolved</p>
          <h3>{loading ? '—' : resolved}</h3>
          <span>Issues completed</span>
        </article>
      </section>

      <ComplaintStatsCharts />

      <section className="citizen-content-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">YOUR ACTIVITY</p>
            <h2>Recent Complaints</h2>
            <p className="section-description">
              Keep track of the latest reports from your account.
            </p>
          </div>

          <span className="complaint-count">
            {total} {total === 1 ? 'report' : 'reports'}
          </span>
        </div>

        {loading ? (
          <div className="citizen-empty-state">
            <h3>Loading your complaints...</h3>
            <p>Please wait while we fetch your reports.</p>
          </div>
        ) : recentComplaints.length === 0 ? (
          <div className="citizen-empty-state modern-empty-state">
            <div className="empty-icon modern-empty-icon">
              <Inbox size={36} />
            </div>
            <h3>No complaints yet</h3>
            <p>You haven't reported any civic issues yet. Spot a pothole, leak, or street light problem?</p>
            <button
              type="button"
              className="primary-button empty-cta-btn"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('civic-navigate-page', { detail: 'Report Issue' })
                )
              }}
            >
              <Sparkles size={15} />
              Report an Issue
            </button>
          </div>
        ) : (
          <div className="citizen-complaint-list">
            {recentComplaints.map((complaint, index) => {
              const status = complaint.status || 'Submitted'
              const complaintId =
                complaint.id ||
                complaint.complaintId ||
                complaint._id ||
                `REPORT-${index + 1}`

              const title =
                complaint.title ||
                complaint.category ||
                complaint.issueType ||
                'Civic issue report'

              const dateValue = complaint.createdAt || complaint.date
              const parsedDate = dateValue
                ? new Date(dateValue)
                : null

              const formattedDate =
                parsedDate && !Number.isNaN(parsedDate.getTime())
                  ? parsedDate.toLocaleDateString()
                  : 'Date unavailable'

              return (
                <article
                  className="citizen-complaint-row"
                  key={complaintId}
                >
                  <div className="complaint-type-icon">⌖</div>

                  <div className="complaint-main">
                    <h3>{title}</h3>
                    <p>
                      ID: {complaintId} <span>·</span> {formattedDate}
                    </p>
                    {complaint.location && (
                      <p>{complaint.location}</p>
                    )}

                    <ComplaintTimeline status={status} />
                  </div>

                  <span className={getStatusClass(status)}>
                    {status}
                  </span>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="citizen-content-card progress-card">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">COMMUNITY IMPACT</p>
            <h2>Resolution Overview</h2>
          </div>
        </div>

        <div className="resolution-summary">
          <div>
            <strong>{loading ? '—' : resolved}</strong>
            <span>resolved out of {total} complaints</span>
          </div>

          <strong>
            {total ? Math.round((resolved / total) * 100) : 0}%
          </strong>
        </div>

        <div
          className="resolution-track"
          role="progressbar"
          aria-label="Complaint resolution rate"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={
            total ? Math.round((resolved / total) * 100) : 0
          }
        >
          <div
            className="resolution-fill"
            style={{
              width: `${
                total ? Math.round((resolved / total) * 100) : 0
              }%`,
            }}
          />
        </div>

        <p className="resolution-note">
          Every report helps your community move towards a better city.
        </p>
      </section>
    </div>
  )
}

export default CitizenDashboard