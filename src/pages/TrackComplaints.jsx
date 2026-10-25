import { useEffect, useState, useCallback } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { apiRequest } from '../services/api'
import './TrackComplaints.css'

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('civicSession') || 'null')
  } catch {
    return null
  }
}

function formatDate(complaint) {
  const value = complaint?.createdAt || complaint?.date
  if (!value) return 'Recent'
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp)
    ? 'Recent'
    : new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
}

function normalizeStatus(status) {
  const value = String(status || 'Submitted')
    .trim()
    .toLowerCase()
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')

  if (['resolved', 'closed'].includes(value)) return 'Resolved'
  if (['in progress', 'processing', 'assigned'].includes(value)) return 'In Progress'
  if (value === 'rejected') return 'Rejected'
  return 'Submitted'
}

function getStatusClass(status) {
  return status.toLowerCase().replaceAll(' ', '-')
}

function getCategoryIcon(category) {
  const cat = String(category || '').toLowerCase()
  if (cat.includes('road') || cat.includes('pothole')) return '🕳️'
  if (cat.includes('water') || cat.includes('leak') || cat.includes('sewage')) return '💧'
  if (cat.includes('garbage') || cat.includes('waste') || cat.includes('sanitation')) return '🗑️'
  if (cat.includes('light') || cat.includes('electric') || cat.includes('power')) return '💡'
  return '⚠️'
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return Infinity
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

function createMapMarkerIcon(status, count = 1, isMine = false) {
  const norm = normalizeStatus(status)
  let color = '#2563eb'
  if (norm === 'Resolved') color = '#10b981'
  else if (norm === 'In Progress') color = '#f59e0b'
  else if (norm === 'Rejected') color = '#ef4444'

  const badgeHtml = count > 1 ? `<span class="civic-pin-badge">${count}</span>` : ''
  const mineRing = isMine ? 'civic-pin-mine' : ''

  return L.divIcon({
    className: 'civic-leaflet-marker',
    html: `
      <div class="civic-pin-wrapper ${mineRing}">
        <div class="civic-pin-body">
          <svg width="28" height="38" viewBox="0 0 28 38" fill="none">
            <path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 38 14 38C14 38 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="${color}"/>
            <circle cx="14" cy="14" r="5.5" fill="#ffffff"/>
            <circle cx="14" cy="14" r="3" fill="${color}"/>
          </svg>
          ${badgeHtml}
        </div>
      </div>
    `,
    iconSize: [28, 38],
    iconAnchor: [14, 38],
    popupAnchor: [0, -36],
  })
}

function MapBoundsController({ complaints }) {
  const map = useMap()

  useEffect(() => {
    const validCoords = complaints
      .filter((c) => c.latitude != null && c.longitude != null)
      .map((c) => [Number(c.latitude), Number(c.longitude)])

    if (validCoords.length === 1) {
      map.setView(validCoords[0], 14)
    } else if (validCoords.length > 1) {
      try {
        const bounds = L.latLngBounds(validCoords)
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
      } catch {}
    }

    const t = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(t)
  }, [complaints, map])

  return null
}

// Smart duplicate/cluster grouping helper
function clusterComplaints(items) {
  const clusters = []
  const visited = new Set()

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const itemId = item._id || item.id || `item_${i}`
    if (visited.has(itemId)) continue
    visited.add(itemId)

    const duplicates = []
    const itemCat = String(item.category || '').trim().toLowerCase()
    const itemLoc = String(item.location || '').trim().toLowerCase()
    const itemLat = item.latitude != null ? Number(item.latitude) : null
    const itemLng = item.longitude != null ? Number(item.longitude) : null

    for (let j = i + 1; j < items.length; j++) {
      const other = items[j]
      const otherId = other._id || other.id || `item_${j}`
      if (visited.has(otherId)) continue

      const otherCat = String(other.category || '').trim().toLowerCase()
      const otherLoc = String(other.location || '').trim().toLowerCase()
      const otherLat = other.latitude != null ? Number(other.latitude) : null
      const otherLng = other.longitude != null ? Number(other.longitude) : null

      let isDuplicate = false

      // Match 1: Coordinates within 85 meters and same category
      if (
        itemLat != null && itemLng != null &&
        otherLat != null && otherLng != null &&
        itemCat === otherCat
      ) {
        const dist = getDistanceMeters(itemLat, itemLng, otherLat, otherLng)
        if (dist <= 85) isDuplicate = true
      }

      // Match 2: Exactly identical non-empty location string and same category
      if (!isDuplicate && itemLoc.length >= 4 && itemLoc === otherLoc && itemCat === otherCat) {
        isDuplicate = true
      }

      if (isDuplicate) {
        visited.add(otherId)
        duplicates.push(other)
      }
    }

    clusters.push({
      primary: item,
      duplicates,
      allReports: [item, ...duplicates],
      count: 1 + duplicates.length,
    })
  }

  return clusters
}

const STEPS = ['Submitted', 'Assigned', 'In Progress', 'Resolved']

function TrackComplaints() {
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  // Citizens and guests default to 'mine' so they see their own complaints first!
  const [scopeFilter, setScopeFilter] = useState(() => {
    const s = getSession()
    return s?.role === 'Officer' ? 'all' : 'mine'
  })

  // Duplicate clustering toggle
  const [groupDuplicates, setGroupDuplicates] = useState(true)
  const [expandedClusters, setExpandedClusters] = useState({})

  const [viewMode, setViewMode] = useState('list') // 'list' or 'map'
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [upvotingId, setUpvotingId] = useState(null)
  const [userUpvotes, setUserUpvotes] = useState({})

  const session = getSession()
  const userEmail = (session?.email || '').trim().toLowerCase()
  const isOfficer = session?.role === 'Officer'

  const fetchComplaints = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      // Fetch public community complaints so we have city data & user slice
      const response = await apiRequest('/api/issues?scope=public')

      let raw = []
      if (Array.isArray(response)) raw = response
      else if (response && Array.isArray(response.complaints)) raw = response.complaints
      else if (response && Array.isArray(response.issues)) raw = response.issues
      else if (response && Array.isArray(response.data)) raw = response.data

      setComplaints(raw)
    } catch (err) {
      setError(err.message || 'Unable to load complaints.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchComplaints()
  }, [fetchComplaints])

  const handleUpvote = async (issueId) => {
    setUpvotingId(issueId)
    try {
      const res = await apiRequest(`/api/issues/${issueId}/upvote`, { method: 'POST' })
      if (res.success) {
        setComplaints((prev) =>
          prev.map((c) =>
            (c._id || c.id) === issueId
              ? {
                  ...c,
                  upvoteCount: res.upvoteCount,
                  priority: res.priority || c.priority,
                }
              : c
          )
        )
        setUserUpvotes((prev) => ({ ...prev, [issueId]: true }))
        window.dispatchEvent(new Event('civic-complaints-updated'))
      }
    } catch (err) {
      console.warn('Upvote failed:', err)
    } finally {
      setUpvotingId(null)
    }
  }

  const toggleClusterExpand = (clusterKey) => {
    setExpandedClusters((prev) => ({
      ...prev,
      [clusterKey]: !prev[clusterKey],
    }))
  }

  // Derive user's own complaints
  const myComplaints = complaints.filter(
    (c) => String(c.submittedByEmail || '').trim().toLowerCase() === userEmail
  )

  // Active list based on scope
  const activeScopeList = !isOfficer && scopeFilter === 'mine' ? myComplaints : complaints

  // Filter active list by search and status
  const filtered = activeScopeList.filter((c) => {
    const text = [c.id, c._id, c.category, c.location, c.description, c.submittedBy]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    const matchesSearch = text.includes(search.trim().toLowerCase())
    const norm = normalizeStatus(c.status)
    const matchesStatus = statusFilter === 'All' || norm === statusFilter

    return matchesSearch && matchesStatus
  })

  // Cluster identical / same-location duplicates if enabled
  const clusters = groupDuplicates
    ? clusterComplaints(filtered)
    : filtered.map((c) => ({
        primary: c,
        duplicates: [],
        allReports: [c],
        count: 1,
      }))

  const totalCount = activeScopeList.length
  const activeCount = activeScopeList.filter(
    (c) => normalizeStatus(c.status) === 'In Progress'
  ).length
  const resolvedCount = activeScopeList.filter(
    (c) => normalizeStatus(c.status) === 'Resolved'
  ).length

  return (
    <div className="track-clean-page">
      {/* 1. Header Row: Quick Stats & View Switcher */}
      <div className="track-clean-header">
        <div className="track-stats-row">
          <span className="track-stat-pill">
            {scopeFilter === 'mine' ? 'My Issues:' : 'Total:'}{' '}
            <strong>{loading ? '—' : totalCount}</strong>
          </span>
          <span className="track-stat-pill orange">
            In Progress: <strong>{loading ? '—' : activeCount}</strong>
          </span>
          <span className="track-stat-pill green">
            Resolved: <strong>{loading ? '—' : resolvedCount}</strong>
          </span>
        </div>

        {/* Scope and 2-Way View Toggle */}
        <div className="track-header-controls">
          {!isOfficer && userEmail && (
            <div className="track-scope-toggle">
              <button
                type="button"
                className={`track-scope-btn ${scopeFilter === 'mine' ? 'active' : ''}`}
                onClick={() => setScopeFilter('mine')}
                title="View only the complaints you submitted"
              >
                👤 My Complaints ({myComplaints.length})
              </button>
              <button
                type="button"
                className={`track-scope-btn ${scopeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setScopeFilter('all')}
                title="View all public city complaints"
              >
                🌍 All City Complaints ({complaints.length})
              </button>
            </div>
          )}

          <div className="track-view-toggle">
            <button
              type="button"
              className={`track-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              📋 List
            </button>
            <button
              type="button"
              className={`track-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
              onClick={() => setViewMode('map')}
            >
              🗺️ Map
            </button>
          </div>
        </div>
      </div>

      {/* 2. Search, Status Filter & Same-Location Duplicate Grouping */}
      <div className="track-filter-bar">
        <div className="track-search-wrap">
          <input
            type="text"
            className="track-search-input"
            placeholder="Search by street, category, or ticket ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="track-search-clear"
              onClick={() => setSearch('')}
            >
              ✕
            </button>
          )}
        </div>

        <div className="track-status-filters">
          {['All', 'In Progress', 'Resolved', 'Submitted'].map((s) => (
            <button
              key={s}
              type="button"
              className={`track-status-chip ${statusFilter === s ? 'active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Smart Duplicate Grouping Toggle */}
        <label
          className="track-group-toggle"
          title="Group complaints reported at the same location into a single card to view unique issues"
        >
          <input
            type="checkbox"
            checked={groupDuplicates}
            onChange={(e) => setGroupDuplicates(e.target.checked)}
          />
          <span className="track-group-toggle-label">
            ⚡ Group Same-Location Duplicates
          </span>
        </label>
      </div>

      {error && (
        <div className="clean-banner error" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* 3. LIST VIEW */}
      {viewMode === 'list' && (
        <div className="track-list-container">
          {!loading && scopeFilter === 'mine' && myComplaints.length === 0 ? (
            /* Friendly Empty State for Citizen who hasn't submitted yet */
            <div className="track-empty-state track-my-empty">
              <span className="empty-icon">📋</span>
              <h3>No Complaints Submitted Yet</h3>
              <p>
                You haven't reported any civic complaints yet. Notice a pothole, broken streetlight, or garbage dump in your neighbourhood?
              </p>
              <div className="track-empty-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent('civic-navigate-page', { detail: 'Report Issue' })
                    )
                  }}
                >
                  ➕ Report an Issue Now →
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setScopeFilter('all')}
                >
                  🌍 Browse All City Complaints ({complaints.length})
                </button>
              </div>
            </div>
          ) : !loading && filtered.length === 0 ? (
            <div className="track-empty-state">
              <p>No complaints found matching your search or filters.</p>
            </div>
          ) : (
            clusters.map((cluster, i) => {
              const c = cluster.primary
              const status = normalizeStatus(c.status)
              const ticketId = c.id || c._id || `ISS-${i + 1}`
              const stepIndex =
                status === 'Resolved' ? 3 : status === 'In Progress' ? 2 : 0

              const isMyComplaint =
                String(c.submittedByEmail || '').trim().toLowerCase() === userEmail
              const hasMyReportInCluster = cluster.allReports.some(
                (r) =>
                  String(r.submittedByEmail || '').trim().toLowerCase() === userEmail
              )

              const isExpanded = Boolean(expandedClusters[ticketId])

              // Sum of upvotes across cluster reports
              const totalAffected = cluster.allReports.reduce(
                (acc, r) => acc + (r.upvoteCount || (r.upvotes ? r.upvotes.length : 1)),
                0
              )

              return (
                <div
                  key={ticketId}
                  className={`track-card ${isMyComplaint || hasMyReportInCluster ? 'my-card' : ''} ${cluster.count > 1 ? 'has-cluster' : ''}`}
                >
                  <div className="track-card-top">
                    <div className="track-card-title-group">
                      <span className="track-card-icon">
                        {getCategoryIcon(c.category)}
                      </span>
                      <div>
                        <div className="track-title-badges-row">
                          <h4>{c.category || 'Civic Issue'}</h4>
                          {(isMyComplaint || hasMyReportInCluster) && (
                            <span className="track-badge-mine">
                              👤 {isMyComplaint ? 'Your Complaint' : 'Includes Your Report'}
                            </span>
                          )}
                          {cluster.count > 1 && (
                            <span className="track-cluster-badge">
                              ⚡ {cluster.count} Reports at this spot
                            </span>
                          )}
                        </div>
                        <span className="track-card-loc">
                          📍 {c.location || 'Location on file'}
                        </span>
                      </div>
                    </div>

                    <div className="track-card-right">
                      <span className={`track-pill status-${getStatusClass(status)}`}>
                        {status}
                      </span>
                      <span className="track-card-date">{formatDate(c)}</span>
                    </div>
                  </div>

                  <p className="track-card-desc">{c.description}</p>

                  {/* Photo thumbnail */}
                  {c.photoData && (
                    <div className="track-photo-thumb-wrap">
                      <img
                        src={c.photoData}
                        alt="Evidence"
                        className="track-card-thumb"
                        onClick={() => setSelectedPhoto(c.photoData)}
                        title="Click to view full photo evidence"
                      />
                    </div>
                  )}

                  {/* Clean 4-step progress line */}
                  <div className="track-progress-row">
                    {STEPS.map((step, idx) => {
                      const isDone = idx <= stepIndex
                      return (
                        <div
                          key={step}
                          className={`track-step-item ${isDone ? 'done' : ''}`}
                        >
                          <span className="track-step-dot" />
                          <span className="track-step-label">{step}</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Community Impact & Me Too Endorsement */}
                  <div className="track-card-footer">
                    <div className="track-footer-left">
                      <span className="track-impact-badge">
                        👥 <strong>{totalAffected}</strong> citizen{totalAffected > 1 ? 's' : ''} affected
                      </span>

                      {cluster.count > 1 && (
                        <button
                          type="button"
                          className="track-cluster-toggle-btn"
                          onClick={() => toggleClusterExpand(ticketId)}
                        >
                          {isExpanded
                            ? `▲ Hide ${cluster.duplicates.length} duplicate report${cluster.duplicates.length > 1 ? 's' : ''}`
                            : `▼ View all ${cluster.count} reports at this spot (${cluster.duplicates.length} duplicates)`}
                        </button>
                      )}
                    </div>

                    {status !== 'Resolved' && status !== 'Rejected' && (
                      <button
                        type="button"
                        className={`track-metoo-btn ${userUpvotes[ticketId] ? 'endorsed' : ''}`}
                        disabled={upvotingId === ticketId || userUpvotes[ticketId]}
                        onClick={() => handleUpvote(ticketId)}
                        title="Endorse this issue to escalate municipal attention"
                      >
                        {userUpvotes[ticketId]
                          ? '✓ Endorsed'
                          : upvotingId === ticketId
                          ? 'Adding...'
                          : '👍 Me Too (+1)'}
                      </button>
                    )}
                  </div>

                  {/* Expanded duplicates breakdown */}
                  {isExpanded && cluster.count > 1 && (
                    <div className="track-cluster-sublist">
                      <div className="track-sublist-header">
                        Reports merged at this exact location:
                      </div>
                      {cluster.allReports.map((sub, sIdx) => {
                        const subIsMine =
                          String(sub.submittedByEmail || '').trim().toLowerCase() ===
                          userEmail
                        const subStatus = normalizeStatus(sub.status)
                        return (
                          <div
                            key={sub._id || sub.id || sIdx}
                            className={`track-sub-row ${subIsMine ? 'mine' : ''}`}
                          >
                            <div className="sub-row-left">
                              <span className="sub-row-ticket">
                                #{sub.id || sub._id?.slice(-6)}
                              </span>
                              <span className="sub-row-date">
                                {formatDate(sub)}
                              </span>
                              {subIsMine && (
                                <span className="sub-row-mine-tag">You</span>
                              )}
                              <span className="sub-row-submitter">
                                by {sub.submittedBy || 'Citizen'}
                              </span>
                            </div>
                            <div className="sub-row-right">
                              <span
                                className={`track-pill status-${getStatusClass(subStatus)}`}
                                style={{ fontSize: '11px', padding: '2px 8px' }}
                              >
                                {subStatus}
                              </span>
                              <span className="sub-row-upvotes">
                                👥 +{sub.upvoteCount || (sub.upvotes ? sub.upvotes.length : 1)}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* 4. MAP VIEW */}
      {viewMode === 'map' && (
        <div className="track-map-container">
          <MapContainer
            center={[19.076, 72.8777]}
            zoom={12}
            style={{ width: '100%', height: '520px', borderRadius: '14px' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapBoundsController complaints={filtered} />

            {clusters
              .filter(
                (cl) =>
                  cl.primary.latitude != null && cl.primary.longitude != null
              )
              .map((cl, i) => {
                const c = cl.primary
                const isMine = cl.allReports.some(
                  (r) =>
                    String(r.submittedByEmail || '').trim().toLowerCase() ===
                    userEmail
                )
                return (
                  <Marker
                    key={c._id || c.id || i}
                    position={[Number(c.latitude), Number(c.longitude)]}
                    icon={createMapMarkerIcon(c.status, cl.count, isMine)}
                  >
                    <Popup>
                      <div style={{ padding: '4px', maxWidth: '230px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                          <strong style={{ fontSize: '13px' }}>
                            {getCategoryIcon(c.category)} {c.category}
                          </strong>
                          {cl.count > 1 && (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b' }}>
                              ⚡ {cl.count} reports
                            </span>
                          )}
                        </div>

                        {isMine && (
                          <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 700, display: 'block', marginTop: '2px' }}>
                            👤 Your Complaint
                          </span>
                        )}

                        <span
                          style={{
                            fontSize: '11.5px',
                            color: '#64748b',
                            display: 'block',
                            margin: '3px 0',
                          }}
                        >
                          📍 {c.location}
                        </span>

                        <p
                          style={{
                            fontSize: '12px',
                            margin: '4px 0',
                            lineHeight: '1.4',
                          }}
                        >
                          {c.description?.slice(0, 90)}...
                        </p>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: '6px',
                          }}
                        >
                          <span
                            className={`track-pill status-${getStatusClass(
                              normalizeStatus(c.status)
                            )}`}
                            style={{ fontSize: '11px' }}
                          >
                            {normalizeStatus(c.status)}
                          </span>
                          <span
                            style={{
                              fontSize: '11.5px',
                              color: '#2563eb',
                              fontWeight: 700,
                            }}
                          >
                            👥 {cl.allReports.reduce((acc, r) => acc + (r.upvoteCount || 1), 0)} affected
                          </span>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
          </MapContainer>
        </div>
      )}

      {/* Simple Image Lightbox */}
      {selectedPhoto && (
        <div className="track-lightbox" onClick={() => setSelectedPhoto(null)}>
          <div className="track-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <img src={selectedPhoto} alt="Evidence" />
            <button
              type="button"
              className="track-lightbox-close"
              onClick={() => setSelectedPhoto(null)}
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default TrackComplaints
