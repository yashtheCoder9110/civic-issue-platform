
export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '')
  }

  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname
    // When accessing from phone or another device on the local Wi-Fi LAN
    if (
      hostname !== 'localhost' &&
      hostname !== '127.0.0.1' &&
      (hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.endsWith('.local'))
    ) {
      return `http://${hostname}:5000`
    }
    
    // In production, warn if VITE_API_BASE_URL was omitted
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      console.warn(
        'VITE_API_BASE_URL is not set. Please configure VITE_API_BASE_URL in your hosting provider (e.g. Vercel) dashboard.'
      )
    }
  }

  return 'http://localhost:5000'
}

export async function apiRequest(path, options = {}) {
  const API_BASE_URL = getApiBaseUrl()

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const headers = new Headers(options.headers || {})

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json')
  }

  // Attach the saved JWT to authenticated API requests.
  const token = localStorage.getItem('civicToken')

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response

  try {
    response = await fetch(
      `${API_BASE_URL.replace(/\/+$/, '')}${normalizedPath}`,
      {
        ...options,
        headers,
      }
    )
  } catch {
    throw new Error(
      `Cannot connect to the backend at ${API_BASE_URL}. Make sure the backend is running.`
    )
  }

  const contentType = response.headers.get('content-type') || ''

  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null
        ? data.message || data.error
        : data

    throw new Error(
      message || `Request failed with status ${response.status}`
    )
  }

  return data
}
