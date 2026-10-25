import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../services/api'
import './Notifications.css'

function formatDate(value) {
  if (!value) return 'Date unavailable'

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString()
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const loadNotifications = useCallback(async () => {
    const token = localStorage.getItem('civicToken')
    const session = JSON.parse(
      localStorage.getItem('civicSession') || 'null'
    )

    if (!token || !session || session.role !== 'Citizen') {
      setNotifications([])
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await apiRequest('/api/notifications')

      setNotifications(response.notifications || [])
    } catch (err) {
      setError(err.message || 'Unable to load notifications.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadNotifications()

    function refreshNotifications() {
      loadNotifications()
    }

    window.addEventListener(
      'civic-notifications-updated',
      refreshNotifications
    )
    window.addEventListener('focus', refreshNotifications)

    // Check for new status updates while the page is open.
    const intervalId = window.setInterval(loadNotifications, 20000)

    return () => {
      window.removeEventListener(
        'civic-notifications-updated',
        refreshNotifications
      )
      window.removeEventListener('focus', refreshNotifications)
      window.clearInterval(intervalId)
    }
  }, [loadNotifications])

  const unreadCount = notifications.filter(
    (notification) => !notification.isRead
  ).length

  async function handleRead(id) {
    try {
      await apiRequest(
        `/api/notifications/${encodeURIComponent(id)}/read`,
        { method: 'PATCH' }
      )

      setNotifications((current) =>
        current.map((notification) =>
          (notification._id || notification.id) === id
            ? { ...notification, isRead: true }
            : notification
        )
      )
    } catch (err) {
      setError(err.message || 'Unable to mark notification as read.')
    }
  }

  async function handleReadAll() {
    const unreadNotifications = notifications.filter(
      (notification) => !notification.isRead
    )

    try {
      await Promise.all(
        unreadNotifications.map((notification) =>
          apiRequest(
            `/api/notifications/${encodeURIComponent(
              notification._id || notification.id
            )}/read`,
            { method: 'PATCH' }
          )
        )
      )

      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          isRead: true,
        }))
      )

      setError('')
    } catch (err) {
      setError(
        err.message ||
          'Some notifications could not be marked as read. Please try again.'
      )

      await loadNotifications()
    }
  }

  return (
    <div className="notifications-widget">
      <button
        type="button"
        className="notification-bell notification-icon-only"
        onClick={() => {
          const nextOpen = !isOpen
          setIsOpen(nextOpen)

          if (nextOpen) {
            loadNotifications()
          }
        }}
        aria-expanded={isOpen}
        aria-label={`Notifications, ${unreadCount} unread`}
        title="Notifications"
      >
        <span aria-hidden="true">🔔</span>

        {unreadCount > 0 && (
          <span className="notification-count">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            className="notification-backdrop"
            aria-label="Close notifications"
            onClick={() => setIsOpen(false)}
          />

          <section
            className="notification-panel"
            aria-label="Your notifications"
          >
            <header className="notification-panel-header">
              <div>
                <h3>Notifications</h3>
                <p>
                  {unreadCount > 0
                    ? `${unreadCount} unread notification${
                        unreadCount === 1 ? '' : 's'
                      }`
                    : "You're all caught up"}
                </p>
              </div>

              <button
                type="button"
                className="notification-close"
                aria-label="Close notifications"
                onClick={() => setIsOpen(false)}
              >
                ×
              </button>
            </header>

            {unreadCount > 0 && (
              <button
                type="button"
                className="mark-all-read"
                onClick={handleReadAll}
              >
                Mark all as read
              </button>
            )}

            {error && (
              <p className="notification-error" role="alert">
                {error}
                <button
                  type="button"
                  onClick={loadNotifications}
                >
                  Retry
                </button>
              </p>
            )}

            {isLoading && notifications.length === 0 ? (
              <div className="notifications-empty">
                <p>Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="notifications-empty">
                <div className="notifications-empty-icon">🔔</div>
                <h4>No notifications yet</h4>
                <p>
                  Complaint status updates will appear here when an officer
                  changes the status of your complaint.
                </p>
              </div>
            ) : (
              <div className="notification-list">
                {notifications.map((notification) => {
                  const id = notification._id || notification.id
                  const isRead = notification.isRead
                  const createdAt =
                    notification.createdAt || notification.date

                  return (
                    <article
                      key={id}
                      className={`notification-item ${
                        isRead ? 'is-read' : 'is-unread'
                      }`}
                    >
                      <div className="notification-item-icon">
                        {notification.newStatus === 'Resolved'
                          ? '✓'
                          : notification.newStatus === 'Rejected'
                            ? '!'
                            : '●'}
                      </div>

                      <div className="notification-item-content">
                        <h4>
                          {notification.title ||
                            `Complaint status: ${
                              notification.newStatus || 'Updated'
                            }`}
                        </h4>

                        <p>{notification.message}</p>

                        <time
                          dateTime={
                            createdAt
                              ? new Date(createdAt).toISOString()
                              : undefined
                          }
                        >
                          {formatDate(createdAt)}
                        </time>

                        {notification.complaintId && (
                          <small>
                            Complaint #{notification.complaintId}
                          </small>
                        )}

                        {!isRead && (
                          <button
                            type="button"
                            className="notification-read-button"
                            onClick={() => handleRead(id)}
                          >
                            Mark as read
                          </button>
                        )}
                      </div>

                      {!isRead && (
                        <span
                          className="notification-unread-dot"
                          aria-label="Unread"
                        />
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
