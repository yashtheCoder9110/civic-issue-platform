
import { useCallback, useEffect, useMemo, useState } from 'react'
import './ComplaintStatsCharts.css'
import { apiRequest } from '../services/api'

const STATUS_COLORS = {
  Submitted: '#64748b',
  'AI Verified': '#8b5cf6',
  Assigned: '#0ea5e9',
  'In Progress': '#f59e0b',
  Resolved: '#10b981',
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem('civicSession') || 'null')
  } catch {
    return null
  }
}

function normalizeStatus(status) {
  const value = String(status || 'Submitted').toLowerCase()

  if (value === 'resolved' || value === 'closed') return 'Resolved'
  if (value === 'in progress' || value === 'in-progress') return 'In Progress'
  if (value === 'ai verified' || value === 'verified') return 'AI Verified'
  if (value === 'assigned') return 'Assigned'

  return 'Submitted'
}

export default function ComplaintStatsCharts() {
  const [complaints, setComplaints] = useState([])
  const [session, setSession] = useState(readSession)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    const currentSession = readSession()
    setSession(currentSession)

    if (!currentSession?.email) {
      setComplaints([])
      setError('Please log in to view complaint statistics.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await apiRequest('/api/issues')

      if (!response.success || !Array.isArray(response.complaints)) {
        throw new Error('The server returned an unexpected response.')
      }

      const visibleComplaints =
        currentSession.role?.toLowerCase() === 'officer'
          ? response.complaints
          : response.complaints.filter(
              (item) =>
                String(item.submittedByEmail || '')
                  .trim()
                  .toLowerCase() ===
                currentSession.email.trim().toLowerCase()
            )

      setComplaints(visibleComplaints)
    } catch (err) {
      setError(err.message || 'Unable to load complaint statistics.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()

    window.addEventListener('focus', loadData)
    window.addEventListener('civic-complaints-updated', loadData)

    return () => {
      window.removeEventListener('focus', loadData)
      window.removeEventListener('civic-complaints-updated', loadData)
    }
  }, [loadData])

  const statusData = useMemo(() => {
    const order = [
      'Submitted',
      'AI Verified',
      'Assigned',
      'In Progress',
      'Resolved',
    ]

    const counts = Object.fromEntries(order.map((status) => [status, 0]))

    complaints.forEach((item) => {
      const status = normalizeStatus(item.status)
      counts[status] += 1
    })

    return order.map((status) => ({
      status,
      count: counts[status],
      color: STATUS_COLORS[status],
    }))
  }, [complaints])

  const categoryData = useMemo(() => {
    const counts = {}

    complaints.forEach((item) => {
      const category = item.category || 'Other'
      counts[category] = (counts[category] || 0) + 1
    })

    return Object.entries(counts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  }, [complaints])

  const total = complaints.length

  const resolved = complaints.filter(
    (item) => normalizeStatus(item.status) === 'Resolved'
  ).length

  const resolutionRate = total
    ? Math.round((resolved / total) * 100)
    : 0

  const maxStatus = Math.max(1, ...statusData.map((item) => item.count))
  const maxCategory = Math.max(1, ...categoryData.map((item) => item.count))

  return (
    <section className="csc-section">
      <div className="csc-heading">
        <div>
          <span className="csc-eyebrow">ANALYTICS OVERVIEW</span>
          <h2>Complaint Statistics</h2>
          <p>
            {session?.role?.toLowerCase() === 'officer'
              ? 'An overview of all recorded civic complaints.'
              : 'An overview of your submitted civic complaints.'}
          </p>
        </div>

        <div className="csc-total-badge">
          <span>Total</span>
          <strong>{loading ? '—' : total}</strong>
        </div>
      </div>

      {error && (
        <p role="alert" className="csc-footnote">
          {error}
        </p>
      )}

      <div className="csc-summary-grid">
        <article className="csc-summary-card csc-summary-blue">
          <span className="csc-summary-icon">▤</span>
          <div>
            <p>Total Complaints</p>
            <strong>{loading ? '—' : total}</strong>
          </div>
        </article>

        <article className="csc-summary-card csc-summary-green">
          <span className="csc-summary-icon">✓</span>
          <div>
            <p>Resolved</p>
            <strong>{loading ? '—' : resolved}</strong>
          </div>
        </article>

        <article className="csc-summary-card csc-summary-purple">
          <span className="csc-summary-icon">↗</span>
          <div>
            <p>Resolution Rate</p>
            <strong>{loading ? '—' : `${resolutionRate}%`}</strong>
          </div>
        </article>
      </div>

      <div className="csc-chart-grid">
        <article className="csc-chart-card">
          <div className="csc-card-heading">
            <div>
              <h3>Complaints by Status</h3>
              <p>Current progress breakdown</p>
            </div>
            <span className="csc-chart-symbol">◉</span>
          </div>

          {loading ? (
            <div className="csc-empty">
              <p>Loading complaint data...</p>
            </div>
          ) : total === 0 ? (
            <div className="csc-empty">
              <span>▥</span>
              <p>No complaint data yet</p>
            </div>
          ) : (
            <div className="csc-status-list">
              {statusData.map((item) => (
                <div className="csc-status-row" key={item.status}>
                  <div className="csc-bar-label">
                    <span className="csc-legend">
                      <i style={{ background: item.color }} />
                      {item.status}
                    </span>
                    <strong>{item.count}</strong>
                  </div>

                  <div className="csc-bar-track">
                    <div
                      className="csc-bar-fill"
                      style={{
                        width: `${(item.count / maxStatus) * 100}%`,
                        background: item.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="csc-chart-card">
          <div className="csc-card-heading">
            <div>
              <h3>Issues by Category</h3>
              <p>Most frequently reported issue types</p>
            </div>
            <span className="csc-chart-symbol">▥</span>
          </div>

          {loading ? (
            <div className="csc-empty">
              <p>Loading category data...</p>
            </div>
          ) : categoryData.length === 0 ? (
            <div className="csc-empty">
              <span>▥</span>
              <p>No category data yet</p>
            </div>
          ) : (
            <div className="csc-category-list">
              {categoryData.map((item, index) => (
                <div className="csc-category-row" key={item.category}>
                  <div className="csc-bar-label">
                    <span title={item.category}>{item.category}</span>
                    <strong>{item.count}</strong>
                  </div>

                  <div className="csc-bar-track">
                    <div
                      className="csc-bar-fill csc-category-fill"
                      style={{
                        width: `${(item.count / maxCategory) * 100}%`,
                        background: [
                          '#3156d9',
                          '#0d9488',
                          '#8b5cf6',
                          '#f59e0b',
                          '#ec4899',
                          '#0891b2',
                        ][index],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  )
}
