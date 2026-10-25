import { useState, useEffect } from 'react'
import { sound } from '../utils/soundFx'
import './TelemetryTicker.css'

export default function TelemetryTicker({ onOpenCmd, activeCity = 'Mumbai Region' }) {
  const [soundEnabled, setSoundEnabled] = useState(() => sound.isEnabled())
  const [timeStr, setTimeStr] = useState('')

  useEffect(() => {
    function updateClock() {
      const now = new Date()
      setTimeStr(
        now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      )
    }
    updateClock()
    const timer = setInterval(updateClock, 1000)
    return () => clearInterval(timer)
  }, [])

  function handleToggleSound() {
    const next = sound.toggle()
    setSoundEnabled(next)
  }

  return (
    <div className="telemetry-bar">
      <div className="telemetry-inner">
        {/* Left: Operational status */}
        <div className="telemetry-left">
          <div className="telemetry-indicator">
            <span className="telemetry-dot" />
            <span className="telemetry-label">GRID RADAR ACTIVE</span>
          </div>

          <div className="telemetry-divider" />

          <div className="telemetry-item">
            <span className="telemetry-dim">MUNICIPALITY:</span>
            <span className="telemetry-val">{activeCity}</span>
          </div>

          <div className="telemetry-divider" />

          <div className="telemetry-item hide-on-mobile">
            <span className="telemetry-dim">SYSTEM TIME:</span>
            <span className="telemetry-mono">{timeStr} IST</span>
          </div>
        </div>

        {/* Right: Tactile Quick Controls */}
        <div className="telemetry-right">
          {/* Audio sound effects toggle */}
          <button
            type="button"
            className={`telemetry-btn ${soundEnabled ? 'is-active' : ''}`}
            onClick={handleToggleSound}
            title={soundEnabled ? 'Mute Interface Sound Effects' : 'Enable Tactical Audio Feedback'}
          >
            <span>{soundEnabled ? '🔊 SFX ON' : '🔇 SFX MUTED'}</span>
          </button>

          {/* Quick Command Palette HUD trigger */}
          <button
            type="button"
            className="telemetry-cmd-btn"
            onClick={() => {
              sound.click()
              onOpenCmd()
            }}
            title="Open Command Dispatcher (Ctrl+K or Cmd+K)"
          >
            <span className="telemetry-cmd-icon">⌘K</span>
            <span className="telemetry-cmd-text">Quick Actions</span>
          </button>
        </div>
      </div>
    </div>
  )
}
