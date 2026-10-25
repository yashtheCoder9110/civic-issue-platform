import { useState, useEffect, useRef, useMemo } from 'react'
import { sound } from '../utils/soundFx'
import './CommandPalette.css'

export default function CommandPalette({
  isOpen,
  onClose,
  onNavigate,
  onSelectAction,
  complaints = [],
}) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      sound.pop()
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Build command catalogue
  const commands = useMemo(() => {
    const list = [
      // Quick navigation
      { id: 'nav-report', category: 'Navigation', icon: '⚡', title: 'Report New Civic Issue', shortcut: 'G R', action: () => onNavigate('Report Issue') },
      { id: 'nav-track', category: 'Navigation', icon: '📡', title: 'Open Incident Radar & Tickets', shortcut: 'G T', action: () => onNavigate('Track Complaints') },
      { id: 'nav-dash', category: 'Navigation', icon: '📊', title: 'Citizen Dashboard', shortcut: 'G D', action: () => onNavigate('Citizen Dashboard') },

      // Speed-Report Presets
      { id: 'preset-pothole', category: 'Speed-Report', icon: '🕳️', title: 'Quick Report: Road Pothole / Crater', meta: 'Roads & Infra · High Priority', action: () => onSelectAction?.('preset-pothole') },
      { id: 'preset-light', category: 'Speed-Report', icon: '💡', title: 'Quick Report: Streetlight Out / Dark', meta: 'Electricity · Medium Priority', action: () => onSelectAction?.('preset-light') },
      { id: 'preset-water', category: 'Speed-Report', icon: '💧', title: 'Quick Report: Water Main Rupture / Leak', meta: 'Water Supply · Urgent', action: () => onSelectAction?.('preset-water') },
      { id: 'preset-garbage', category: 'Speed-Report', icon: '🗑️', title: 'Quick Report: Illegal Waste Dump', meta: 'Sanitation · Medium Priority', action: () => onSelectAction?.('preset-garbage') },
      { id: 'preset-wire', category: 'Speed-Report', icon: '⚡', title: 'Quick Report: Exposed Live Wire Danger', meta: 'Public Safety · Critical Urgency', action: () => onSelectAction?.('preset-wire') },

      // Radar & Map controls
      { id: 'view-radar', category: 'Radar Controls', icon: '🗺️', title: 'Switch to Spatial City Radar Map', action: () => onSelectAction?.('view-radar') },
      { id: 'view-split', category: 'Radar Controls', icon: '⚡', title: 'Switch to Split Incident Inspector', action: () => onSelectAction?.('view-split') },
      { id: 'view-cards', category: 'Radar Controls', icon: '▦', title: 'Switch to Ticket Grid Cards', action: () => onSelectAction?.('view-cards') },

      // City teleports
      { id: 'city-mumbai', category: 'City Teleport', icon: '📍', title: 'Teleport GPS: Mumbai City Center', action: () => onSelectAction?.('teleport-mumbai') },
      { id: 'city-navi', category: 'City Teleport', icon: '📍', title: 'Teleport GPS: Navi Mumbai', action: () => onSelectAction?.('teleport-navi') },
      { id: 'city-thane', category: 'City Teleport', icon: '📍', title: 'Teleport GPS: Thane Municipal Area', action: () => onSelectAction?.('teleport-thane') },
      { id: 'city-pune', category: 'City Teleport', icon: '📍', title: 'Teleport GPS: Pune Tech Corridor', action: () => onSelectAction?.('teleport-pune') },

      // Audio & Theme
      { id: 'toggle-sound', category: 'System', icon: '🔊', title: 'Toggle Tactical Sound Feedback', action: () => onSelectAction?.('toggle-sound') },
    ]

    // Append search matches from active complaints
    if (complaints && complaints.length > 0) {
      complaints.slice(0, 15).forEach((c, i) => {
        const id = c._id || c.id || `complaint-${i}`
        list.push({
          id: `ticket-${id}`,
          category: 'Active Complaints',
          icon: '🎫',
          title: c.location ? `${c.category || 'Incident'} @ ${c.location}` : (c.description || 'Complaint record'),
          meta: `Status: ${c.status || 'Submitted'} · ID: ${String(id).slice(-6)}`,
          action: () => onSelectAction?.('inspect-ticket', c),
        })
      })
    }

    return list
  }, [complaints, onNavigate, onSelectAction])

  // Filter commands by query
  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter((c) =>
      c.title.toLowerCase().includes(q) ||
      (c.meta && c.meta.toLowerCase().includes(q)) ||
      c.category.toLowerCase().includes(q)
    )
  }, [commands, query])

  // Keep selectedIndex in bounds
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('.cmd-item.is-selected')
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  // Handle keyboard navigation
  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      sound.click()
      setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      sound.click()
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1))
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[selectedIndex]
      if (item) {
        sound.success()
        item.action()
        onClose()
      }
    }
  }

  if (!isOpen) return null

  return (
    <div className="cmd-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command Palette">
      <div className="cmd-modal" onClick={(e) => e.stopPropagation()}>
        {/* Search Input Bar */}
        <div className="cmd-input-wrapper">
          <span className="cmd-icon-search">⚡</span>
          <input
            ref={inputRef}
            type="text"
            className="cmd-input"
            placeholder="Type a command, city, ticket ID, or issue keyword..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="cmd-kbd-esc" onClick={onClose}>ESC</kbd>
        </div>

        {/* Results List */}
        <div className="cmd-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="cmd-empty">
              <span>No matching municipal operations found for "{query}"</span>
            </div>
          ) : (
            filtered.map((item, index) => {
              const isSelected = index === selectedIndex
              return (
                <div
                  key={item.id}
                  className={`cmd-item ${isSelected ? 'is-selected' : ''}`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => {
                    sound.success()
                    item.action()
                    onClose()
                  }}
                >
                  <div className="cmd-item-left">
                    <span className="cmd-item-icon">{item.icon}</span>
                    <div className="cmd-item-texts">
                      <span className="cmd-item-title">{item.title}</span>
                      {item.meta && <span className="cmd-item-meta">{item.meta}</span>}
                    </div>
                  </div>

                  <div className="cmd-item-right">
                    <span className="cmd-item-cat">{item.category}</span>
                    {item.shortcut && <kbd className="cmd-item-kbd">{item.shortcut}</kbd>}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="cmd-footer">
          <div className="cmd-footer-keys">
            <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span><kbd>↵</kbd> execute</span>
            <span><kbd>ESC</kbd> dismiss</span>
          </div>
          <span className="cmd-footer-brand">CIVICCONNECT HUD v3.2</span>
        </div>
      </div>
    </div>
  )
}
