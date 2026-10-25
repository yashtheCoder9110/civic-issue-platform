import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext({
  theme: 'system',
  resolvedTheme: 'light',
  toggleTheme: () => {},
  setTheme: () => {},
})

function getInitialTheme() {
  try {
    const saved = localStorage.getItem('civicTheme')
    if (saved === 'dark' || saved === 'light' || saved === 'system') {
      return saved
    }
  } catch {}
  return 'system'
}

function getSystemPreference() {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme)
  const [systemTheme, setSystemTheme] = useState(getSystemPreference)

  // Listen to OS theme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e) => {
      setSystemTheme(e.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const resolvedTheme = theme === 'system' ? systemTheme : theme

  // Apply theme to HTML root element and sync meta tags
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme)
    document.documentElement.style.colorScheme = resolvedTheme

    const meta = document.querySelector('meta[name="color-scheme"]')
    if (meta) {
      meta.content = resolvedTheme
    }
  }, [resolvedTheme])

  function setTheme(newTheme) {
    setThemeState(newTheme)
    try {
      if (newTheme === 'system') {
        localStorage.removeItem('civicTheme')
      } else {
        localStorage.setItem('civicTheme', newTheme)
      }
    } catch {}
  }

  function toggleTheme() {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
