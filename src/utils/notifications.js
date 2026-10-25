
function readJSON(key, fallback = []) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null')
    return value ?? fallback
  } catch {
    return fallback
  }
}

function getAllNotifications() {
  const data = readJSON('civicNotifications', [])
  return Array.isArray(data) ? data : []
}

function getSession() {
  return readJSON('civicSession', null)
}

function saveNotifications(notifications) {
  localStorage.setItem(
    'civicNotifications',
    JSON.stringify(notifications.slice(0, 200))
  )

  window.dispatchEvent(new Event('civic-notifications-updated'))
}

function getVisibleNotifications() {
  const session = getSession()

  if (!session?.email || !session?.role) {
    return []
  }

  const email = String(session.email).trim().toLowerCase()
  const role = String(session.role).trim().toLowerCase()

  return getAllNotifications().filter((notification) => {
    const recipientRole = String(
      notification.recipientRole || ''
    ).trim().toLowerCase()

    const recipientEmail = String(
      notification.recipientEmail || ''
    ).trim().toLowerCase()

    if (role === 'citizen') {
      return recipientRole === 'citizen' && recipientEmail === email
    }

    if (role === 'officer') {
      return (
        recipientRole === 'officer' &&
        (!recipientEmail || recipientEmail === email)
      )
    }

    return false
  })
}

export function getNotifications() {
  return getVisibleNotifications()
}

export function addNotification({
  complaintId,
  title,
  message,
  type = 'status',
  recipientRole = 'Citizen',
  recipientEmail = '',
}) {
  const primary = readJSON('complaints', [])
  const secondary = readJSON('civicComplaints', [])

  const complaints = new Map()

  if (Array.isArray(secondary)) {
    secondary.forEach((item) => complaints.set(String(item.id), item))
  }

  if (Array.isArray(primary)) {
    primary.forEach((item) => complaints.set(String(item.id), item))
  }

  const complaint = complaints.get(String(complaintId))
  const role = String(recipientRole).trim().toLowerCase()

  let email = String(recipientEmail || '').trim().toLowerCase()

  if (role === 'citizen') {
    email = email || String(complaint?.submittedByEmail || '')
      .trim()
      .toLowerCase()

    if (!email) {
      console.warn(
        'Notification not created: citizen email is missing.',
        complaintId
      )
      return false
    }
  }

  const notification = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    complaintId,
    title: title || 'Complaint update',
    message: message || 'There is an update to your complaint.',
    type,
    recipientRole: role === 'officer' ? 'Officer' : 'Citizen',
    recipientEmail: email,
    date: new Date().toISOString(),
    read: false,
  }

  try {
    const notifications = getAllNotifications()
    notifications.unshift(notification)
    saveNotifications(notifications)
    return true
  } catch (error) {
    console.error('Could not save notification:', error)
    return false
  }
}

export function markNotificationRead(notificationId) {
  const visibleIds = new Set(
    getVisibleNotifications().map((item) => item.id)
  )

  if (!visibleIds.has(notificationId)) return

  const notifications = getAllNotifications().map((item) =>
    item.id === notificationId ? { ...item, read: true } : item
  )

  try {
    saveNotifications(notifications)
  } catch (error) {
    console.error('Could not mark notification as read:', error)
  }
}

export function markAllNotificationsRead() {
  const visibleIds = new Set(
    getVisibleNotifications().map((item) => item.id)
  )

  const notifications = getAllNotifications().map((item) =>
    visibleIds.has(item.id) ? { ...item, read: true } : item
  )

  try {
    saveNotifications(notifications)
  } catch (error) {
    console.error('Could not mark notifications as read:', error)
  }
}
