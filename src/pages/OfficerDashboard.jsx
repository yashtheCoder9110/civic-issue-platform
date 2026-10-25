
import { useCallback, useEffect, useState, useMemo } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { apiRequest } from '../services/api'
import './OfficerDashboard.css'

const STATUSES = [
  'Submitted',
  'Pending',
  'In Progress',
  'Resolved',
  'Rejected',
]

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']
const LEGACY_ASSIGNMENT = '__legacy__'

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

function computeComplaintClusters(items) {
  const activeIssues = items.filter(
    (item) => !['resolved', 'rejected', 'closed'].includes((item.status || '').toLowerCase())
  )

  const visited = new Set()
  const clusters = []

  for (let i = 0; i < activeIssues.length; i++) {
    const itemA = activeIssues[i]
    const idA = itemA._id || itemA.id || `item_${i}`
    if (visited.has(idA)) continue

    const clusterItems = [itemA]
    visited.add(idA)

    const latA = Number(itemA.latitude)
    const lngA = Number(itemA.longitude)
    const catA = (itemA.category || '').toLowerCase()

    for (let j = i + 1; j < activeIssues.length; j++) {
      const itemB = activeIssues[j]
      const idB = itemB._id || itemB.id || `item_${j}`
      if (visited.has(idB)) continue

      const latB = Number(itemB.latitude)
      const lngB = Number(itemB.longitude)
      const catB = (itemB.category || '').toLowerCase()

      let isNearby = false
      if (!isNaN(latA) && !isNaN(lngA) && !isNaN(latB) && !isNaN(lngB)) {
        const dist = getDistanceMeters(latA, lngA, latB, lngB)
        if (dist <= 350) {
          isNearby = true
        }
      } else if (
        itemA.location &&
        itemB.location &&
        itemA.location.toLowerCase().trim() === itemB.location.toLowerCase().trim()
      ) {
        isNearby = true
      }

      if (isNearby && (catA === catB || (itemA.location && itemA.location === itemB.location))) {
        clusterItems.push(itemB)
        visited.add(idB)
      }
    }

    if (clusterItems.length > 1) {
      const totalCitizens = clusterItems.reduce((acc, curr) => {
        const count = curr.upvoteCount || (curr.upvotes ? curr.upvotes.length : 1)
        return acc + Math.max(count, 1)
      }, 0)

      clusters.push({
        id: `cluster_${idA}`,
        primaryComplaint: itemA,
        category: itemA.category || 'Civic Issue',
        location: itemA.location || 'Multiple nearby points',
        items: clusterItems,
        count: clusterItems.length,
        totalCitizens,
        complaintIds: clusterItems.map((c) => c._id || c.id),
      })
    }
  }

  return clusters
}

export default function OfficerDashboard() {
  const [complaints, setComplaints] = useState([])
  const [officers, setOfficers] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [updatingId, setUpdatingId] = useState(null)
  const [assignmentDrafts, setAssignmentDrafts] = useState({})
  const [savedMessage, setSavedMessage] = useState('')
  const [dashboardTab, setDashboardTab] = useState('all') // 'all' | 'clusters'
  const [selectedPhoto, setSelectedPhoto] = useState(null)

  const loadOfficers = useCallback(async () => {
    try {
      const response = await apiRequest('/api/issues/officers')
      const items = Array.isArray(response.officers)
        ? response.officers
        : []

      setOfficers(items)
      return items
    } catch (error) {
      setMessage(
        error.message || 'Unable to load registered officers.'
      )
      return []
    }
  }, [])

  const loadComplaints = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const response = await apiRequest('/api/issues')
      const items = Array.isArray(response.complaints)
        ? response.complaints
        : []

      setComplaints(items)

      setAssignmentDrafts((previous) => {
        const next = { ...previous }

        items.forEach((item) => {
          const id = item._id || item.id
          if (!id) return

          // Keep an existing selection while the user is editing.
          if (!(id in next)) {
            next[id] =
              item.assignedOfficerId ||
              (item.assignedOfficer ? LEGACY_ASSIGNMENT : '')
          }
        })

        return next
      })

      setMessage('')
    } catch (error) {
      setMessage(error.message || 'Unable to load complaints.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    // selectedPhoto-escape-listener
    function handleKeyDown(e) {
      if (e.key === 'Escape') setSelectedPhoto(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const loadDashboard = async () => {
      await loadOfficers()
      await loadComplaints()
    }

    loadDashboard()

    const handleFocus = () => loadComplaints(true)
    const handleUpdate = () => loadComplaints(true)

    window.addEventListener('focus', handleFocus)
    window.addEventListener('civic-complaints-updated', handleUpdate)

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener(
        'civic-complaints-updated',
        handleUpdate
      )
    }
  }, [loadOfficers, loadComplaints])

  const updateComplaint = async (complaint, changes) => {
    const id = complaint._id || complaint.id

    if (!id) {
      setMessage('This complaint is missing its ID.')
      return false
    }

    setUpdatingId(id)
    setMessage('')
    setSavedMessage('')

    try {
      const response = await apiRequest(`/api/issues/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      })

      if (response.complaint) {
        setComplaints((previous) =>
          previous.map((item) =>
            (item._id || item.id) === id
              ? response.complaint
              : item
          )
        )

        setAssignmentDrafts((previous) => ({
          ...previous,
          [id]:
            response.complaint.assignedOfficerId ||
            (response.complaint.assignedOfficer
              ? LEGACY_ASSIGNMENT
              : ''),
        }))
      } else {
        await loadComplaints(true)
      }

      window.dispatchEvent(new Event('civic-complaints-updated'))
      return true
    } catch (error) {
      setMessage(error.message || 'Unable to update complaint.')
      await loadComplaints(true)
      return false
    } finally {
      setUpdatingId(null)
    }
  }

  const saveAssignment = async (complaint) => {
    const id = complaint._id || complaint.id
    const value = assignmentDrafts[id] || ''
    const currentId = complaint.assignedOfficerId || ''

    if (value === LEGACY_ASSIGNMENT) {
      setSavedMessage(
        'This is an older name-only assignment. Select a registered officer or choose Unassigned.'
      )
      return
    }

    if (value === currentId) {
      setSavedMessage('No assignment changes to save.')
      return
    }

    const selectedOfficer = officers.find(
      (officer) => officer.id === value
    )

    const success = await updateComplaint(complaint, {
      assignedOfficerId: value,
    })

    if (success) {
      setSavedMessage(
        value
          ? `Officer assigned successfully: ${
              selectedOfficer?.name || 'Selected officer'
            }`
          : 'Officer assignment cleared successfully.'
      )
    }
  }

  const normalizedSearch = search.trim().toLowerCase()

  const filteredComplaints = complaints.filter((complaint) => {
    const status = complaint.status || 'Submitted'
    const priority = complaint.priority || 'Medium'

    const matchesStatus =
      statusFilter === 'All' || status === statusFilter
    const matchesPriority =
      priorityFilter === 'All' || priority === priorityFilter

    const searchableText = [
      complaint.title,
      complaint.description,
      complaint.category,
      complaint.location,
      complaint.submittedBy,
      complaint.submittedByEmail,
      complaint.email,
      complaint._id,
      complaint.id,
      complaint.assignedOfficer,
      complaint.aiVerificationStatus,
      complaint.aiSuggestedPriority,
      complaint.aiVerificationReason,
      complaint.aiPriorityReason,
      ...(Array.isArray(complaint.aiMatchedKeywords)
        ? complaint.aiMatchedKeywords
        : []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return (
      matchesStatus &&
      matchesPriority &&
      searchableText.includes(normalizedSearch)
    )
  })

  const clusters = useMemo(() => {
    return computeComplaintClusters(complaints)
  }, [complaints])

  const clusterMap = useMemo(() => {
    const map = new Map()
    for (const cluster of clusters) {
      for (const item of cluster.items) {
        const id = item._id || item.id
        if (id) map.set(id, cluster)
      }
    }
    return map
  }, [clusters])

  const countStatus = (status) =>
    complaints.filter(
      (item) => (item.status || 'Submitted') === status
    ).length

  const handleResolveCluster = async (cluster, newStatus = 'Resolved') => {
    const confirm = window.confirm(
      `Are you sure you want to mark all ${cluster.count} duplicate complaints in this cluster (${cluster.location}) as "${newStatus}" simultaneously?`
    )
    if (!confirm) return

    setUpdatingId(cluster.id)
    try {
      const res = await apiRequest('/api/issues/cluster/resolve', {
        method: 'POST',
        body: JSON.stringify({
          complaintIds: cluster.complaintIds,
          status: newStatus,
          resolutionNotes: `Bulk updated ${cluster.count} duplicate/same-location reports to ${newStatus} by municipal officer.`,
        }),
      })

      if (res.success) {
        setSavedMessage(
          `✓ Successfully updated all ${res.resolvedCount || cluster.count} duplicate complaints in cluster to "${newStatus}"!`
        )
        await loadComplaints(true)
        window.dispatchEvent(new Event('civic-complaints-updated'))
      }
    } catch (err) {
      setMessage(err.message || 'Could not update cluster.')
    } finally {
      setUpdatingId(null)
    }
  }

  const handleExportPDF = () => {
    const targetList = filteredComplaints.length > 0 ? filteredComplaints : complaints
    if (!targetList.length) {
      setMessage('No complaints available to export.')
      return
    }

    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })

      // Header Banner
      doc.setFillColor(37, 99, 235)
      doc.rect(0, 0, doc.internal.pageSize.width, 58, 'F')

      // Title
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(18)
      doc.text('CivicConnect — Municipal Complaints Redressal Report', 36, 32)

      // Subtitle
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(220, 238, 255)
      const reportDate = new Date().toLocaleString()
      doc.text(
        `Generated: ${reportDate}  |  Exported Records: ${targetList.length} of ${complaints.length} Total`,
        36,
        48
      )

      // Summary Bar
      const totalCount = targetList.length
      const resolvedCount = targetList.filter(
        (c) => (c.status || '').toLowerCase() === 'resolved'
      ).length
      const inProgressCount = targetList.filter(
        (c) => (c.status || '').toLowerCase() === 'in progress'
      ).length
      const pendingCount = totalCount - resolvedCount - inProgressCount

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      doc.setTextColor(30, 41, 59)
      doc.text(
        `STATUS SUMMARY:  Submitted/Pending: ${pendingCount}   |   In Progress: ${inProgressCount}   |   Resolved: ${resolvedCount}`,
        36,
        78
      )

      // Table Data
      const tableData = targetList.map((item, index) => {
        const ticketId = (item._id || item.id || `T-${index + 1}`).toString().slice(-6)
        const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Recent'
        const cat = item.category || 'General'
        const loc = item.location || 'Location on file'
        const prio = item.priority || 'Medium'
        const status = item.status || 'Submitted'
        const impact =
          (item.upvoteCount || (item.upvotes ? item.upvotes.length : 0)) > 0
            ? `+${item.upvoteCount || item.upvotes.length} Citizens`
            : '1 Citizen'
        const assigned = item.assignedOfficer || 'Unassigned'
        const reporter = item.submittedBy || 'Citizen'

        return [
          `#${ticketId}`,
          date,
          cat,
          loc.length > 36 ? `${loc.slice(0, 36)}...` : loc,
          prio,
          status,
          impact,
          assigned,
          reporter,
        ]
      })

      autoTable(doc, {
        startY: 92,
        head: [
          [
            'Ticket ID',
            'Date',
            'Category',
            'Location',
            'Priority',
            'Status',
            'Community Impact',
            'Assigned Officer',
            'Reported By',
          ],
        ],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5,
        },
        styles: {
          fontSize: 8,
          cellPadding: 4.5,
          textColor: [30, 41, 59],
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { cellWidth: 55 },
          1: { cellWidth: 60 },
          2: { cellWidth: 75 },
          3: { cellWidth: 165 },
          4: { cellWidth: 55 },
          5: { cellWidth: 65 },
          6: { cellWidth: 90 },
          7: { cellWidth: 90 },
          8: { cellWidth: 80 },
        },
      })

      const totalPages = doc.internal.getNumberOfPages()
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p)
        doc.setFontSize(8)
        doc.setTextColor(148, 163, 184)
        doc.text(
          `CivicConnect Municipal Administration • Page ${p} of ${totalPages}`,
          doc.internal.pageSize.width - 240,
          doc.internal.pageSize.height - 15
        )
      }

      doc.save(
        `CivicConnect_Complaints_Report_${new Date().toISOString().split('T')[0]}.pdf`
      )
      setSavedMessage(`✓ Complaints report downloaded as PDF successfully!`)
    } catch (err) {
      console.error('PDF error:', err)
      setMessage('Failed to generate PDF: ' + err.message)
    }
  }

  if (loading) {
    return (
      <main className="officer-dashboard">
        <div className="dashboard-loading">
          <div className="loading-spinner" />
          <h2>Loading Officer Dashboard</h2>
          <p>Getting the latest complaints...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="officer-dashboard">
      <header className="dashboard-header">
        <div className="dashboard-title-group">
          <div className="dashboard-eyebrow">
            CIVICCONNECT • ADMINISTRATION
          </div>
          <h1>Officer Dashboard</h1>
          <p>Review, track and manage citizen complaints.</p>
        </div>

        <div className="dashboard-header-actions">
          <button
            type="button"
            className="pdf-export-button"
            onClick={handleExportPDF}
            title="Download complaints report as PDF"
          >
            <span className="pdf-icon">📄</span>
            Download PDF Report
          </button>

          <button
            type="button"
            className={`refresh-button ${refreshing ? 'is-refreshing' : ''}`}
            onClick={() => loadComplaints(true)}
            disabled={refreshing}
          >
            <span
              className={
                refreshing ? 'refresh-icon spinning' : 'refresh-icon'
              }
            >
              ↻
            </span>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {message && (
        <div className="dashboard-alert" role="alert">
          <span>⚠</span>
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage('')}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      {savedMessage && (
        <div className="dashboard-alert" role="status">
          <span>✓</span>
          <span>{savedMessage}</span>
          <button
            type="button"
            onClick={() => setSavedMessage('')}
            aria-label="Dismiss confirmation"
          >
            ×
          </button>
        </div>
      )}

      <section className="stats-grid">
        <StatCard
          label="Total Complaints"
          value={complaints.length}
          icon="▤"
          color="blue"
        />
        <StatCard
          label="Submitted"
          value={countStatus('Submitted')}
          icon="◷"
          color="orange"
        />
        <StatCard
          label="In Progress"
          value={countStatus('In Progress')}
          icon="↗"
          color="purple"
        />
        <StatCard
          label="Resolved"
          value={countStatus('Resolved')}
          icon="✓"
          color="green"
        />
      </section>

      <section className="complaints-section">
        <div className="section-heading">
          <div>
            <h2>Manage Complaints</h2>
            <p>Review, resolve, or cluster duplicate reports.</p>
          </div>
          <div className="officer-view-tabs">
            <button
              type="button"
              className={`officer-tab-btn ${dashboardTab === 'all' ? 'active' : ''}`}
              onClick={() => setDashboardTab('all')}
            >
              📋 All Complaints ({complaints.length})
            </button>
            <button
              type="button"
              className={`officer-tab-btn ${dashboardTab === 'clusters' ? 'active' : ''}`}
              onClick={() => setDashboardTab('clusters')}
            >
              📍 Duplicates & Clusters ({clusters.length})
            </button>
          </div>
        </div>

        {dashboardTab === 'clusters' ? (
          <div className="clusters-container">
            <div className="clusters-header-info">
              <div>
                <h3>📍 Spatial Incident Clusters & Duplicates ({clusters.length})</h3>
                <p>
                  Multiple citizens reported complaints at the same location. Review linked tickets and resolve all duplicates in a single bulk action.
                </p>
              </div>
            </div>

            {clusters.length === 0 ? (
              <div className="empty-clusters-card">
                <span className="empty-cluster-icon">✓</span>
                <h3>No Duplicate Location Clusters Found</h3>
                <p>All active complaints are currently separate or resolved.</p>
              </div>
            ) : (
              <div className="clusters-grid">
                {clusters.map((cluster) => (
                  <div key={cluster.id} className="cluster-card">
                    <div className="cluster-card-top">
                      <div>
                        <div className="cluster-tags-row">
                          <span className="cluster-duplicate-badge">
                            🔥 {cluster.count} Duplicate Tickets
                          </span>
                          <span className="cluster-category-badge">{cluster.category}</span>
                          <span className="cluster-citizens-badge">
                            👥 {cluster.totalCitizens} Total Affected
                          </span>
                        </div>
                        <h4 className="cluster-location-title">📍 {cluster.location}</h4>
                      </div>

                      <div className="cluster-actions-group">
                        <button
                          type="button"
                          className="cluster-in-progress-btn"
                          disabled={updatingId === cluster.id}
                          onClick={() => handleResolveCluster(cluster, 'In Progress')}
                          title="Mark all tickets in this cluster as In Progress"
                        >
                          {updatingId === cluster.id ? 'Updating...' : '↗ Set All In Progress'}
                        </button>

                        <button
                          type="button"
                          className="cluster-bulk-resolve-btn"
                          disabled={updatingId === cluster.id}
                          onClick={() => handleResolveCluster(cluster, 'Resolved')}
                          title="Mark all tickets in this cluster as Resolved"
                        >
                          {updatingId === cluster.id ? 'Resolving...' : '⚡ Bulk Resolve All'}
                        </button>
                      </div>
                    </div>

                    <div className="cluster-tickets-sublist">
                      <h5>Linked Citizen Reports ({cluster.items.length}):</h5>
                      <div className="cluster-tickets-scroll">
                        {cluster.items.map((item, idx) => {
                          const ticketId = item._id || item.id
                          return (
                            <div key={ticketId || idx} className="cluster-ticket-row">
                              <div className="cluster-ticket-head">
                                <span className="cluster-ticket-id">#{ticketId ? ticketId.slice(-6) : idx + 1}</span>
                                <span className="cluster-ticket-author">👤 {item.submittedBy || 'Citizen'}</span>
                                <span className="cluster-ticket-date">
                                  {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Recent'}
                                </span>
                                <span className={`cluster-status-pill status-${(item.status || 'Submitted').toLowerCase().replace(' ', '-')}`}>
                                  {item.status || 'Submitted'}
                                </span>
                              </div>
                              <p className="cluster-ticket-desc">{item.description}</p>
                              {item.photoData && (
                                <img src={item.photoData} alt="Evidence" className="cluster-ticket-thumb" onClick={() => setSelectedPhoto(item.photoData)} style={{ cursor: 'pointer' }} title="Click to inspect evidence photo" />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {clusters.length > 0 && (
              <div className="officer-duplicates-alert-bar">
                <div className="alert-bar-left">
                  <span className="alert-bar-icon">🔥</span>
                  <div>
                    <h4>{clusters.length} Duplicate Location Clusters Detected</h4>
                    <p>
                      Multiple citizens reported identical issues at the same locations ({clusters.reduce((acc, c) => acc + c.count, 0)} total complaints, {clusters.reduce((acc, c) => acc + c.totalCitizens, 0)} affected citizens). You can review and resolve them together in bulk.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="alert-bar-action-btn"
                  onClick={() => setDashboardTab('clusters')}
                >
                  Review Duplicate Clusters ({clusters.length}) →
                </button>
              </div>
            )}

        <div className="filter-toolbar">
          <div className="search-box">
            <span className="search-icon">⌕</span>
            <input
              type="search"
              placeholder="Search by title, location, category..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search complaints"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="All">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
            aria-label="Filter by priority"
          >
            <option value="All">All priorities</option>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority} priority
              </option>
            ))}
          </select>
        </div>

        {refreshing && (
          <div className="refresh-progress">
            <div className="refresh-progress-bar" />
          </div>
        )}

        {filteredComplaints.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">▤</div>
            <h3>No complaints found</h3>
            <p>
              {complaints.length === 0
                ? 'There are no complaints available for your account yet.'
                : 'Try changing your search terms or filters.'}
            </p>

            {(search ||
              statusFilter !== 'All' ||
              priorityFilter !== 'All') && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setSearch('')
                  setStatusFilter('All')
                  setPriorityFilter('All')
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="complaint-list">
            {filteredComplaints.map((complaint) => {
              const id = complaint._id || complaint.id
              const status = complaint.status || 'Submitted'
              const priority = complaint.priority || 'Medium'
              const isUpdating = updatingId === id

              const assignmentDraft =
                assignmentDrafts[id] ??
                complaint.assignedOfficerId ??
                (complaint.assignedOfficer
                  ? LEGACY_ASSIGNMENT
                  : '')

              const verificationStatus =
                complaint.aiVerificationStatus || 'Not assessed'

              const suggestedPriority =
                complaint.aiSuggestedPriority || 'Not available'

              const matchedKeywords = Array.isArray(
                complaint.aiMatchedKeywords
              )
                ? complaint.aiMatchedKeywords
                : []

              return (
                <article className="complaint-card" key={id}>
                  <div className="complaint-card-header">
                    <div className="complaint-title-wrap">
                      <div className="complaint-category-icon">
                        {complaint.category?.toLowerCase().includes('road')
                          ? '⌁'
                          : complaint.category?.toLowerCase().includes('water')
                            ? '♧'
                            : complaint.category?.toLowerCase().includes('light')
                              ? '☼'
                              : '▤'}
                      </div>

                      <div>
                        <h3>
                          {complaint.title ||
                            complaint.category ||
                            'Citizen Complaint'}
                        </h3>
                        <p className="complaint-id">ID: {id}</p>
                      </div>
                    </div>

                    <div className="card-header-badge-group">
                      {clusterMap.has(id) && (
                        <button
                          type="button"
                          className="complaint-cluster-chip"
                          onClick={() => setDashboardTab('clusters')}
                          title="Click to view all duplicate complaints at this location"
                        >
                          🔥 {clusterMap.get(id).count} Same-Location Reports
                        </button>
                      )}
                      {(complaint.upvoteCount > 0 ||
                        (complaint.upvotes && complaint.upvotes.length > 0)) && (
                        <span
                          className="complaint-impact-badge"
                          title="Citizens who endorsed this issue"
                        >
                          👥 +{complaint.upvoteCount || complaint.upvotes.length} Affected
                        </span>
                      )}
                      <span
                        className={`status-badge status-${status
                          .toLowerCase()
                          .replace(/\s+/g, '-')}`}
                      >
                        <span className="status-dot" />
                        {status}
                      </span>
                    </div>
                  </div>

                  <p className="complaint-description">
                    {complaint.description || 'No description provided.'}
                  </p>

                  {/* Citizen Photo Evidence for Urgency Assessment */}
                  {complaint.photoData ? (
                    <div className="officer-evidence-container">
                      <div className="officer-evidence-header">
                        <span className="officer-evidence-label">
                          📷 Citizen Photo Evidence
                          <span className="officer-evidence-hint">
                            (Click to enlarge & evaluate urgency)
                          </span>
                        </span>
                        {complaint.photoName && (
                          <span className="officer-evidence-filename">
                            📎 {complaint.photoName}
                          </span>
                        )}
                      </div>
                      <div
                        className="officer-photo-preview"
                        onClick={() => setSelectedPhoto(complaint.photoData)}
                        title="Click to view full photo evidence"
                      >
                        <img
                          src={complaint.photoData}
                          alt={complaint.photoName || 'Issue evidence'}
                          className="officer-photo-thumb"
                        />
                        <div className="officer-photo-overlay">
                          <span className="officer-zoom-badge">
                            🔍 Inspect Photo
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="officer-no-photo-badge">
                      <span>📷 No photo uploaded with this complaint</span>
                    </div>
                  )}

                  <section
                    className="ai-assessment"
                    aria-label="AI complaint assessment"
                  >
                    <div className="ai-assessment-heading">
                      <div>
                        <span className="ai-eyebrow">
                          CIVICCONNECT • AI ASSISTANT
                        </span>
                        <h4>Initial Complaint Assessment</h4>
                      </div>

                      <span
                        className={`ai-verification-badge ${
                          verificationStatus === 'Verified'
                            ? 'ai-verified'
                            : verificationStatus === 'Needs Review'
                              ? 'ai-needs-review'
                              : 'ai-not-assessed'
                        }`}
                      >
                        {verificationStatus}
                      </span>
                    </div>

                    <div className="ai-assessment-grid">
                      <div className="ai-assessment-item">
                        <span>Suggested priority</span>
                        <strong>
                          <span
                            className={`priority-badge ${
                              PRIORITIES.includes(suggestedPriority)
                                ? `priority-${suggestedPriority.toLowerCase()}`
                                : ''
                            }`}
                          >
                            {suggestedPriority}
                          </span>
                        </strong>
                      </div>

                      <div className="ai-assessment-item">
                        <span>Verification reason</span>
                        <p>
                          {complaint.aiVerificationReason ||
                            'No verification explanation is available for this complaint.'}
                        </p>
                      </div>

                      <div className="ai-assessment-item">
                        <span>Priority explanation</span>
                        <p>
                          {complaint.aiPriorityReason ||
                            'No priority recommendation explanation is available.'}
                        </p>
                      </div>

                      <div className="ai-assessment-item ai-keywords">
                        <span>Matched keywords</span>
                        {matchedKeywords.length > 0 ? (
                          <div className="ai-keyword-list">
                            {matchedKeywords.map((keyword, index) => (
                              <span
                                className="ai-keyword"
                                key={`${keyword}-${index}`}
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p>No matched keywords were recorded.</p>
                        )}
                      </div>
                    </div>

                    <p className="ai-disclaimer">
                      This is an automated, rule-based suggestion, not proof
                      that a complaint is genuine. Please review the details
                      before making a decision.
                    </p>
                  </section>

                  <div className="complaint-details-grid">
                    <Detail
                      label="Category"
                      value={complaint.category || 'Not specified'}
                    />
                    <Detail
                      label="Location"
                      value={complaint.location || 'Not specified'}
                    />
                    <Detail
                      label="Submitted by"
                      value={complaint.submittedBy || 'Citizen'}
                    />

                    <div className="detail-item">
                      <span>Current priority</span>
                      <strong>
                        <span
                          className={`priority-badge priority-${priority.toLowerCase()}`}
                        >
                          {priority}
                        </span>
                      </strong>
                    </div>

                    <Detail
                      label="Assigned officer"
                      value={complaint.assignedOfficer || 'Unassigned'}
                    />
                    <Detail
                      label="Submitted"
                      value={
                        complaint.createdAt
                          ? new Date(
                              complaint.createdAt
                            ).toLocaleDateString()
                          : 'Not available'
                      }
                    />
                  </div>

                  {clusterMap.has(id) && (
                    <div className="card-cluster-banner">
                      <div className="card-cluster-info">
                        <strong>🔥 Duplicate Issue Cluster ({clusterMap.get(id).count} Same-Location Reports)</strong>
                        <span>📍 {clusterMap.get(id).location} • {clusterMap.get(id).totalCitizens} citizens affected</span>
                      </div>
                      <div className="card-cluster-actions">
                        <button
                          type="button"
                          className="card-cluster-view-btn"
                          onClick={() => setDashboardTab('clusters')}
                        >
                          View Linked Reports ({clusterMap.get(id).count}) →
                        </button>
                        <button
                          type="button"
                          className="card-cluster-resolve-btn"
                          disabled={updatingId === clusterMap.get(id).id}
                          onClick={() => handleResolveCluster(clusterMap.get(id), 'Resolved')}
                        >
                          {updatingId === clusterMap.get(id).id ? 'Resolving...' : `⚡ Bulk Resolve All (${clusterMap.get(id).count})`}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="complaint-card-footer">
                    <label>
                      <span>Update status</span>
                      <select
                        value={status}
                        disabled={isUpdating}
                        onChange={(event) =>
                          updateComplaint(complaint, {
                            status: event.target.value,
                          })
                        }
                      >
                        {STATUSES.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>Update priority</span>
                      <select
                        value={priority}
                        disabled={isUpdating}
                        onChange={(event) =>
                          updateComplaint(complaint, {
                            priority: event.target.value,
                          })
                        }
                      >
                        {PRIORITIES.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="assignment-control">
                      <label htmlFor={`assign-${id}`}>
                        <span>Assign officer</span>
                        <select
                          id={`assign-${id}`}
                          value={assignmentDraft}
                          disabled={isUpdating}
                          onChange={(event) =>
                            setAssignmentDrafts((previous) => ({
                              ...previous,
                              [id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Unassigned</option>

                          {assignmentDraft === LEGACY_ASSIGNMENT && (
                            <option value={LEGACY_ASSIGNMENT} disabled>
                              Older assignment: {complaint.assignedOfficer}
                            </option>
                          )}

                          {officers.map((officer) => (
                            <option
                              key={officer.id}
                              value={officer.id}
                            >
                              {officer.name} ({officer.email})
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={isUpdating}
                        onClick={() => saveAssignment(complaint)}
                      >
                        {isUpdating ? 'Saving…' : 'Save Assignment'}
                      </button>
                    </div>
                  </div>

                  {isUpdating && (
                    <div className="saving-indicator">
                      <span className="small-spinner" />
                      Saving changes…
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </>
    )}
  </section>

      <footer className="dashboard-footer">
        <span>CivicConnect • Officer Workspace</span>
        <span>{complaints.length} total complaints</span>
      </footer>

      {/* Evidence Inspection Modal / Lightbox */}
      {selectedPhoto && (
        <div
          className="officer-lightbox-backdrop"
          onClick={() => setSelectedPhoto(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Photo evidence preview"
        >
          <div
            className="officer-lightbox-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="officer-lightbox-header">
              <div className="officer-lightbox-title">
                <span className="officer-lightbox-icon">🔍</span>
                <div>
                  <strong>Citizen Visual Evidence Inspection</strong>
                  <p>Examine severity and physical hazards to judge complaint urgency level.</p>
                </div>
              </div>
              <button
                type="button"
                className="officer-lightbox-close"
                onClick={() => setSelectedPhoto(null)}
                title="Close preview"
              >
                ✕ Close
              </button>
            </div>
            <div className="officer-lightbox-body">
              <img
                src={selectedPhoto}
                alt="High-resolution evidence"
                className="officer-lightbox-img"
              />
            </div>
            <div className="officer-lightbox-footer">
              <span>Tip: Use this visual proof to determine if the report is Urgent (e.g. live wires, major leaks, large potholes) or Low/Medium.</span>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function StatCard({ label, value, icon, color }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon stat-icon-${color}`}>
        {icon}
      </div>
      <div className="stat-card-content">
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </article>
  )
}

function Detail({ label, value }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
