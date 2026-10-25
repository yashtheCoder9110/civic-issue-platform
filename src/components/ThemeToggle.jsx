import { useState, useRef, useEffect } from 'react'
import { Sun, Moon, Monitor, Check } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import './ThemeToggle.css'

export default function ThemeToggle() {
  const { theme, resolvedTheme, toggleTheme, setTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // Close dropdown menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  const isDark = resolvedTheme === 'dark'

  return (
    <div className="theme-toggle-wrapper" ref={menuRef}>
      <button
        type="button"
        className={`theme-toggle-btn ${isDark ? 'is-dark' : 'is-light'}`}
        onClick={toggleTheme}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenuOpen((prev) => !prev)
        }}
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode (Right-click for options)`}
        title={`Current mode: ${theme} (${resolvedTheme}). Click to toggle, right-click for theme menu.`}
      >
        <span className="theme-icon-track">
          {isDark ? (
            <Moon className="theme-icon moon-icon" size={18} />
          ) : (
            <Sun className="theme-icon sun-icon" size={18} />
          )}
        </span>
        <span className="theme-btn-label">
          {isDark ? 'Dark' : 'Light'}
        </span>
      </button>

      {menuOpen && (
        <div className="theme-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className={`theme-option ${theme === 'light' ? 'active' : ''}`}
            onClick={() => {
              setTheme('light')
              setMenuOpen(false)
            }}
          >
            <Sun size={15} />
            <span>Light</span>
            {theme === 'light' && <Check size={14} className="check-icon" />}
          </button>

          <button
            type="button"
            role="menuitem"
            className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => {
              setTheme('dark')
              setMenuOpen(false)
            }}
          >
            <Moon size={15} />
            <span>Dark</span>
            {theme === 'dark' && <Check size={14} className="check-icon" />}
          </button>

          <button
            type="button"
            role="menuitem"
            className={`theme-option ${theme === 'system' ? 'active' : ''}`}
            onClick={() => {
              setTheme('system')
              setMenuOpen(false)
            }}
          >
            <Monitor size={15} />
            <span>System ({resolvedTheme})</span>
            {theme === 'system' && <Check size={14} className="check-icon" />}
          </button>
        </div>
      )}
    </div>
  )
}
