import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { apiRequest } from '../services/api'
import { sound } from '../utils/soundFx'
import './ReportIssue.css'

const defaultPosition = [19.076, 72.8777] // Mumbai

function createCustomPin() {
  return L.divIcon({
    className: 'civic-leaflet-marker',
    html: `
      <div class="civic-pin-wrapper">
        <div class="civic-pin-body">
          <svg width="28" height="38" viewBox="0 0 28 38" fill="none">
            <path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 38 14 38C14 38 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="#2563eb"/>
            <circle cx="14" cy="14" r="5.5" fill="#ffffff"/>
            <circle cx="14" cy="14" r="3" fill="#2563eb"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [28, 38],
    iconAnchor: [14, 38],
    popupAnchor: [0, -36],
  })
}

function MapController({ position, onSelect }) {
  const map = useMap()

  useEffect(() => {
    map.setView(position, 15)
    const t = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(t)
  }, [map, position])

  useMapEvents({
    click(event) {
      onSelect(event.latlng.lat, event.latlng.lng)
    },
  })

  return null
}

function DraggablePin({ position, onSelect }) {
  const pinIcon = createCustomPin()
  return (
    <Marker
      position={position}
      icon={pinIcon}
      draggable
      eventHandlers={{
        dragend(event) {
          const point = event.target.getLatLng()
          onSelect(point.lat, point.lng)
        },
      }}
    />
  )
}

const CATEGORIES = [
  { label: 'Pothole', icon: '🕳️' },
  { label: 'Garbage', icon: '🗑️' },
  { label: 'Water Leakage', icon: '💧' },
  { label: 'Broken Streetlight', icon: '💡' },
  { label: 'Other', icon: '⚠️' },
]

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

function ReportIssue() {
  const [category, setCategory] = useState('Pothole')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('')
  const [latitude, setLatitude] = useState('19.076000')
  const [longitude, setLongitude] = useState('72.877700')
  const [gpsLoading, setGpsLoading] = useState(false)
  const [mapPosition, setMapPosition] = useState(defaultPosition)
  const [submitting, setSubmitting] = useState(false)

  // Live Camera States & Refs
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [cameraFacing, setCameraFacing] = useState('environment')
  const [cameraError, setCameraError] = useState('')
  const [cameraLoading, setCameraLoading] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)
  const [cameraDevices, setCameraDevices] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [activeCameraLabel, setActiveCameraLabel] = useState('')
  const [cameraResolution, setCameraResolution] = useState('')
  const [isShutterFlashing, setIsShutterFlashing] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  // Duplicate & Proximity Detection States
  const [publicIssues, setPublicIssues] = useState([])
  const [nearbyDuplicates, setNearbyDuplicates] = useState([])
  const [dismissedDuplicateId, setDismissedDuplicateId] = useState(null)
  const [endorsingId, setEndorsingId] = useState(null)
  const [endorsedSuccess, setEndorsedSuccess] = useState('')
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [endorsedTicketId, setEndorsedTicketId] = useState('')

  useEffect(() => {
    if (!photo) {
      setPhotoPreview('')
      return
    }

    if (typeof photo === 'string') {
      setPhotoPreview(photo)
      return
    }

    const previewURL = URL.createObjectURL(photo)
    setPhotoPreview(previewURL)
    return () => URL.revokeObjectURL(previewURL)
  }, [photo])

  // Helper: detect if client is mobile device
  const isMobileDevice = useCallback(() => {
    if (typeof navigator === 'undefined') return false
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  }, [])

  // Enumerate connected video devices to populate camera switcher
  const updateCameraDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return []
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoInputs = devices.filter((d) => d.kind === 'videoinput')
      setCameraDevices(videoInputs)
      return videoInputs
    } catch (err) {
      console.warn('Could not list video devices:', err)
      return []
    }
  }, [])

  // Callback ref: directly attaches stream & muted attributes as soon as <video> mounts
  const setVideoRef = useCallback((node) => {
    videoRef.current = node
    if (node) {
      node.muted = true
      node.defaultMuted = true
      node.playsInline = true
      node.setAttribute('playsinline', 'true')
      node.setAttribute('muted', 'true')
      node.setAttribute('autoplay', 'true')
      if (streamRef.current) {
        if (node.srcObject !== streamRef.current) {
          node.srcObject = streamRef.current
        }
        node.play().catch((err) => {
          console.warn('Video callback ref auto-play notice:', err)
        })
      }
    }
  }, [])

  // Keep video.srcObject in sync if stream state changes
  useEffect(() => {
    if (isCameraOpen && cameraStream && videoRef.current) {
      const v = videoRef.current
      if (v.srcObject !== cameraStream) {
        v.srcObject = cameraStream
      }
      v.muted = true
      v.defaultMuted = true
      v.playsInline = true
      v.play().catch((err) => console.warn('Stream sync play warning:', err))
    }
  }, [isCameraOpen, cameraStream])

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop())
      } catch (err) {
        console.warn('Camera track stop error:', err)
      }
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraStream(null)
    setIsCameraOpen(false)
    setCameraLoading(false)
    setActiveCameraLabel('')
    setCameraResolution('')
  }, [])

  // Start video stream with device-aware progressive fallback plans
  const startCamera = useCallback(
    async (facing = cameraFacing, deviceId = null) => {
      setCameraError('')
      setCameraLoading(true)
      setIsCameraOpen(true)

      // Terminate any existing active stream tracks
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach((t) => t.stop())
        } catch {}
        streamRef.current = null
      }
      setCameraStream(null)

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // If on a mobile device or insecure HTTP origin, seamlessly open the device's camera
        if (cameraInputRef.current) {
          stopCamera()
          cameraInputRef.current.click()
          return
        }

        setCameraError(
          'Camera access is not supported in this browser context. Please upload an image file.'
        )
        setCameraLoading(false)
        return
      }

      const mobile = isMobileDevice()
      const targetDeviceId = deviceId !== null ? deviceId : selectedCameraId || null
      let stream = null

      // Progressive strategy list:
      // 1. If explicit deviceId is chosen, request by deviceId
      // 2. If mobile, use facingMode (environment / user)
      // 3. If desktop/laptop, use clean video constraints WITHOUT facingMode (prevents OverconstrainedError on Windows laptops)
      // 4. Universal fallback to { video: true }
      const planList = []

      if (targetDeviceId) {
        planList.push({
          video: {
            deviceId: { exact: targetDeviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        planList.push({
          video: { deviceId: { ideal: targetDeviceId } },
          audio: false,
        })
      }

      if (mobile) {
        planList.push({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        planList.push({
          video: { facingMode: facing },
          audio: false,
        })
      } else {
        // Desktop / Laptop (Windows, Mac, Linux): request resolution directly without unsupported facingMode
        planList.push({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
      }

      // Universal fallbacks
      planList.push({
        video: true,
        audio: false,
      })

      let lastError = null
      for (const constraints of planList) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints)
          if (stream) break
        } catch (err) {
          lastError = err
          console.warn('getUserMedia plan skipped:', constraints, err.name || err)
        }
      }

      if (!stream) {
        // If on mobile and live stream failed, seamlessly launch native phone camera
        if (mobile && cameraInputRef.current) {
          stopCamera()
          cameraInputRef.current.click()
          return
        }

        console.error('All camera initialization plans failed:', lastError)
        let userMsg = 'Could not access camera device.'
        if (
          lastError?.name === 'NotAllowedError' ||
          lastError?.name === 'PermissionDeniedError'
        ) {
          userMsg =
            'Camera permission is blocked. Click the lock 🔒 or camera 📷 icon in your browser address bar (top-left), change Camera to "Allow", and click Retry.'
        } else if (
          lastError?.name === 'NotFoundError' ||
          lastError?.name === 'DevicesNotFoundError'
        ) {
          userMsg =
            'No webcam or camera device was detected on your computer. You can upload an image file.'
        } else if (
          lastError?.name === 'NotReadableError' ||
          lastError?.name === 'TrackStartError'
        ) {
          userMsg =
            'Camera is in use by another app (Zoom, Teams, Skype, or another tab). Close the other application and click Retry.'
        } else if (lastError?.name === 'OverconstrainedError') {
          userMsg =
            'The camera does not support requested settings. You can upload an image file.'
        } else if (lastError?.message) {
          userMsg = lastError.message
        }
        setCameraError(userMsg)
        setCameraLoading(false)
        return
      }

      // Stream successfully acquired
      streamRef.current = stream
      setCameraStream(stream)

      // Query track resolution & label
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) {
        const settings = videoTrack.getSettings ? videoTrack.getSettings() : {}
        if (settings.width && settings.height) {
          setCameraResolution(`${settings.width}x${settings.height}`)
        }
        if (settings.deviceId) {
          setSelectedCameraId(settings.deviceId)
        }
        setActiveCameraLabel(videoTrack.label || (mobile ? `${facing} camera` : 'Webcam'))
      }

      // Bind directly to video element if already rendered
      if (videoRef.current) {
        const v = videoRef.current
        v.muted = true
        v.defaultMuted = true
        v.playsInline = true
        v.srcObject = stream
        v.play().catch((err) => console.warn('Stream play error:', err))
      }

      // Enumerate devices now that permission is active to reveal actual device labels
      updateCameraDevices()
    },
    [cameraFacing, isMobileDevice, selectedCameraId, updateCameraDevices]
  )

  const handleCameraDeviceChange = (e) => {
    const newId = e.target.value
    setSelectedCameraId(newId)
    startCamera(cameraFacing, newId)
  }

  const flipCamera = () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment'
    setCameraFacing(nextFacing)
    startCamera(nextFacing, null)
  }

  // Unified Camera Action:
  // - On desktop or secure context: opens real-time live viewfinder
  // - On phone over HTTP (local Wi-Fi IP): mobile browsers disable WebRTC, so this immediately triggers the phone's native camera!
  const handleCameraAction = useCallback(() => {
    const hasMedia =
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)

    const isSecure =
      typeof window !== 'undefined' &&
      (window.isSecureContext ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1')

    if (!hasMedia || !isSecure) {
      if (cameraInputRef.current) {
        cameraInputRef.current.value = ''
        cameraInputRef.current.click()
        return
      }
    }

    startCamera(isMobileDevice() ? 'environment' : 'user')
  }, [isMobileDevice, startCamera])

  const captureCameraPhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current

    const w = video.videoWidth || 1280
    const h = video.videoHeight || 720
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, w, h)

    setIsShutterFlashing(true)
    setTimeout(() => setIsShutterFlashing(false), 260)

    try {
      sound.click()
    } catch {}

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
    setPhotoPreview(dataUrl)

    try {
      const arr = dataUrl.split(',')
      const mime = arr[0].match(/:(.*?);/)[1]
      const bstr = atob(arr[1])
      let n = bstr.length
      const u8arr = new Uint8Array(n)
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n)
      }
      const file = new File([u8arr], `camera_snap_${Date.now()}.jpg`, { type: mime })
      setPhoto(file)
    } catch {
      setPhoto(dataUrl)
    }

    setTimeout(() => {
      stopCamera()
    }, 180)
  }

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  // Load public issues to detect nearby duplicates
  useEffect(() => {
    const loadPublicIssues = async () => {
      try {
        const res = await apiRequest('/api/issues?scope=public')
        const items = Array.isArray(res.complaints)
          ? res.complaints
          : Array.isArray(res)
          ? res
          : []
        setPublicIssues(items)
      } catch (e) {
        console.warn('Could not pre-fetch public complaints for duplicate check', e)
      }
    }
    loadPublicIssues()
  }, [])

  // Calculate nearby duplicates whenever coordinates, category, location, or publicIssues change
  useEffect(() => {
    if (!publicIssues.length) {
      setNearbyDuplicates([])
      return
    }

    const curLat = latitude ? Number(latitude) : null
    const curLng = longitude ? Number(longitude) : null
    const locInput = (location || '').trim().toLowerCase()
    const curCat = (category || '').trim().toLowerCase()

    const matches = publicIssues
      .filter((issue) => {
        const status = (issue.status || '').toLowerCase()
        if (['resolved', 'closed', 'rejected'].includes(status)) {
          return false
        }

        // 1. Proximity check
        let dist = Infinity
        if (
          curLat != null &&
          curLng != null &&
          issue.latitude != null &&
          issue.longitude != null
        ) {
          dist = getDistanceMeters(
            curLat,
            curLng,
            Number(issue.latitude),
            Number(issue.longitude)
          )
        }

        // 2. Textual / address check if user typed a location
        const issueLoc = (issue.location || '').trim().toLowerCase()
        const textMatch =
          locInput.length >= 4 &&
          (issueLoc.includes(locInput) || locInput.includes(issueLoc))

        const sameCat =
          (issue.category || '').trim().toLowerCase() === curCat

        // Match if nearby with same category (<=350m), or very close (<=60m), or location text matches with same category
        return (dist <= 350 && sameCat) || dist <= 60 || (textMatch && sameCat)
      })
      .map((issue) => {
        const curLat = latitude ? Number(latitude) : null
        const curLng = longitude ? Number(longitude) : null
        let dist = Infinity
        if (
          curLat != null &&
          curLng != null &&
          issue.latitude != null &&
          issue.longitude != null
        ) {
          dist = getDistanceMeters(
            curLat,
            curLng,
            Number(issue.latitude),
            Number(issue.longitude)
          )
        }
        const sameCat =
          (issue.category || '').trim().toLowerCase() === curCat
        return {
          ...issue,
          distanceMeters: dist,
          sameCategory: sameCat,
        }
      })
      .sort((a, b) => {
        if (a.sameCategory && !b.sameCategory) return -1
        if (!a.sameCategory && b.sameCategory) return 1
        return a.distanceMeters - b.distanceMeters
      })

    setNearbyDuplicates(matches)
  }, [latitude, longitude, category, location, publicIssues])

  const handleEndorseExisting = async (issueId) => {
    setEndorsingId(issueId)
    try {
      const res = await apiRequest(`/api/issues/${issueId}/upvote`, { method: 'POST' })
      if (res.success) {
        try { sound.success() } catch {}
        const ticketNum = res.complaint?.id || (typeof issueId === 'string' ? issueId.slice(-6) : issueId)
        setEndorsedTicketId(ticketNum)
        setEndorsedSuccess(
          `✓ Thanks! Your +1 endorsement was registered for Ticket #${ticketNum}. Municipal priority has been escalated to Urgent without creating duplicate tickets!`
        )
        setPublicIssues((prev) =>
          prev.map((item) =>
            (item._id || item.id) === issueId
              ? {
                  ...item,
                  upvoteCount: res.upvoteCount || (item.upvoteCount || 1) + 1,
                  priority: res.priority || item.priority,
                }
              : item
          )
        )
        setShowDuplicateModal(false)
        window.dispatchEvent(new Event('civic-complaints-updated'))
      }
    } catch (err) {
      showMessage(err.message || 'Could not endorse ticket.')
    } finally {
      setEndorsingId(null)
    }
  }

  function showMessage(text, type = 'error') {
    setMessage(text)
    setMessageType(type)
  }

  // Auto-reverse geocode street name when user clicks map
  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
      const response = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!response.ok) return
      const data = await response.json()
      if (data?.address) {
        const parts = [
          data.address.road || data.address.pedestrian || data.address.suburb,
          data.address.neighbourhood || data.address.suburb,
          data.address.city || data.address.town,
        ].filter(Boolean)
        const street = parts.length > 0 ? parts.join(', ') : data.display_name?.slice(0, 60)
        if (street) setLocation(street)
      }
    } catch {}
  }, [])

  const selectCoordinates = useCallback((lat, lng, label) => {
    const cleanLat = Number(lat)
    const cleanLng = Number(lng)
    setLatitude(cleanLat.toFixed(6))
    setLongitude(cleanLng.toFixed(6))
    setMapPosition([cleanLat, cleanLng])

    if (label) {
      setLocation(label)
    } else {
      reverseGeocode(cleanLat, cleanLng)
    }
  }, [reverseGeocode])

  // Native Browser GPS
  function getGPSLocation() {
    if (!navigator.geolocation) {
      showMessage('Geolocation is not supported by your browser.')
      return
    }

    setGpsLoading(true)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        selectCoordinates(lat, lng)
        setGpsLoading(false)
      },
      () => {
        showMessage('Unable to detect location. Please tap the map directly.')
        setGpsLoading(false)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

function compressImage(file, maxWidth = 1600, maxHeight = 1600, quality = 0.85) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) {
      resolve(file)
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let w = img.width
        let h = img.height

        if (w > maxWidth || h > maxHeight) {
          if (w > h) {
            h = Math.round((h * maxWidth) / w)
            w = maxWidth
          } else {
            w = Math.round((w * maxHeight) / h)
            h = maxHeight
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const fileName = file.name
                ? file.name.replace(/\.[^.]+$/, '.jpg')
                : `camera_photo_${Date.now()}.jpg`
              const compressedFile = new File([blob], fileName, { type: 'image/jpeg' })
              resolve(compressedFile)
            } else {
              resolve(file)
            }
          },
          'image/jpeg',
          quality
        )
      }
      img.onerror = () => resolve(file)
      img.src = e.target.result
    }
    reader.onerror = () => resolve(file)
    reader.readAsDataURL(file)
  })
}

  async function handlePhotoChange(event) {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) return

    if (!selectedFile.type.startsWith('image/')) {
      showMessage('Please select an image file (PNG, JPG, or WEBP).')
      return
    }

    setMessage('')

    try {
      // Auto-compress large phone camera photos so they never exceed limits or lag the device
      const optimizedFile = await compressImage(selectedFile)
      setPhoto(optimizedFile)
      try {
        sound.click()
      } catch {}
    } catch (err) {
      console.warn('Image optimization fallback:', err)
      setPhoto(selectedFile)
    }
  }

  function removePhoto() {
    setPhoto(null)
    setPhotoPreview('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  function readPhotoAsDataURL(file) {
    if (typeof file === 'string') return Promise.resolve(file)
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Could not process photo file.'))
      reader.readAsDataURL(file)
    })
  }

  async function handleSubmit(event, forceSubmit = false) {
    if (event && event.preventDefault) event.preventDefault()
    setMessage('')

    if (!location.trim()) {
      showMessage('Please enter an address or tap on the map to set location.')
      return
    }

    if (!description.trim() || description.trim().length < 8) {
      showMessage('Please describe the issue in at least 8 characters.')
      return
    }

    // Intercept if same complaint is already registered for this location
    if (
      !forceSubmit &&
      primaryDuplicate &&
      (primaryDuplicate._id || primaryDuplicate.id) !== dismissedDuplicateId &&
      (primaryDuplicate.sameCategory || primaryDuplicate.distanceMeters < 120)
    ) {
      setShowDuplicateModal(true)
      return
    }

    setSubmitting(true)

    try {
      const session = JSON.parse(localStorage.getItem('civicSession') || 'null')

      if (!session || !session.email) {
        showMessage('Please sign in before submitting.')
        setSubmitting(false)
        return
      }

      const photoData = photo ? await readPhotoAsDataURL(photo) : ''

      const complaint = {
        submittedBy: session.name || 'Citizen',
        submittedByEmail: session.email,
        submittedByRole: session.role || 'Citizen',
        category,
        priority: 'Medium',
        description: description.trim(),
        location: location.trim(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        photoName: photo ? (photo.name || 'camera_snapshot.jpg') : '',
        photoData,
      }

      const result = await apiRequest('/api/issues', {
        method: 'POST',
        body: JSON.stringify(complaint),
      })

      if (!result.success) {
        throw new Error(result.message || 'Could not submit your complaint.')
      }

      const ticketId = result.complaint?.id || result.id || 'Submitted'
      showMessage(`✓ Issue submitted successfully! Ticket #${ticketId}`, 'success')

      // Reset Form
      setDescription('')
      setLocation('')
      setPhoto(null)
      setPhotoPreview('')
      if (fileInputRef.current) fileInputRef.current.value = ''

      window.dispatchEvent(new Event('civic-complaints-updated'))
    } catch (error) {
      showMessage(error.message || 'Could not submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const primaryDuplicate = nearbyDuplicates.find(
    (d) => (d._id || d.id) !== dismissedDuplicateId
  )

  return (
    <div className="report-clean-page">
      <form onSubmit={handleSubmit} className="report-clean-card">
        <div className="report-clean-grid">
          {/* Left Column: Form Details */}
          <div className="report-clean-fields">
            {/* Proximity Duplicate & Same-Location Detection */}
            {primaryDuplicate && !endorsedSuccess && (
              <div className="duplicate-alert-card">
                <div className="duplicate-alert-header">
                  <div className="duplicate-header-title">
                    <span className="duplicate-badge">⚠️ Complaint Already Registered!</span>
                    <span className="duplicate-distance">
                      {primaryDuplicate.distanceMeters < 1000
                        ? `📍 ~${primaryDuplicate.distanceMeters}m from pin`
                        : '📍 Same Location'}
                    </span>
                  </div>
                  <span className="duplicate-ticket-id">
                    #{primaryDuplicate.id || primaryDuplicate._id?.slice(-6)}
                  </span>
                </div>

                <div className="duplicate-alert-body">
                  <div className="duplicate-info">
                    <h4>{primaryDuplicate.category}: {primaryDuplicate.location}</h4>
                    <p className="duplicate-desc">
                      "{primaryDuplicate.description?.length > 130
                        ? `${primaryDuplicate.description.slice(0, 130)}...`
                        : primaryDuplicate.description}"
                    </p>
                    <div className="duplicate-meta">
                      <span className="duplicate-status">
                        Status: <strong>{primaryDuplicate.status || 'Submitted'}</strong>
                      </span>
                      <span className="duplicate-upvotes">
                        👥 <strong>{primaryDuplicate.upvoteCount || (primaryDuplicate.upvotes ? primaryDuplicate.upvotes.length : 1)}</strong> citizen(s) affected
                      </span>
                    </div>
                  </div>
                  {primaryDuplicate.photoData && (
                    <img
                      src={primaryDuplicate.photoData}
                      alt="Existing complaint evidence"
                      className="duplicate-thumb"
                      onClick={() => setPhotoPreview(primaryDuplicate.photoData)}
                      title="Click to view existing evidence photo"
                    />
                  )}
                </div>

                <div className="duplicate-advisory-note">
                  💡 Municipal authorities have already received this report. Instead of filing duplicate tickets, add your <strong>+1 Endorsement</strong> to escalate its priority to Urgent!
                </div>

                <div className="duplicate-actions">
                  <button
                    type="button"
                    className="duplicate-btn-endorse"
                    disabled={endorsingId === (primaryDuplicate._id || primaryDuplicate.id)}
                    onClick={() =>
                      handleEndorseExisting(primaryDuplicate._id || primaryDuplicate.id)
                    }
                  >
                    {endorsingId
                      ? 'Adding Endorsement...'
                      : "👍 I'm Experiencing This Too (+1 Endorse)"}
                  </button>
                  <button
                    type="button"
                    className="duplicate-btn-dismiss"
                    onClick={() =>
                      setDismissedDuplicateId(primaryDuplicate._id || primaryDuplicate.id)
                    }
                  >
                    📝 Different Issue — Continue My Form
                  </button>
                </div>
              </div>
            )}

            {endorsedSuccess && (
              <div className="duplicate-success-card">
                <span className="duplicate-success-icon">✓</span>
                <div className="duplicate-success-content">
                  <h4>Endorsement Recorded!</h4>
                  <p>{endorsedSuccess}</p>
                  <div className="duplicate-success-actions">
                    <button
                      type="button"
                      className="primary-button btn-small"
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent('civic-navigate-page', { detail: 'Track Complaints' })
                        )
                      }}
                    >
                      🔍 Track in Issues →
                    </button>
                    <button
                      type="button"
                      className="secondary-button btn-small"
                      onClick={() => {
                        setEndorsedSuccess('')
                        setDismissedDuplicateId(primaryDuplicate?._id || primaryDuplicate?.id)
                        setDescription('')
                        setLocation('')
                        setPhoto(null)
                        setPhotoPreview('')
                      }}
                    >
                      ➕ Report Another Issue
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 1. Category Selection */}
            <div className="clean-field">
              <label>Issue Type</label>
              <div className="clean-category-row">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.label}
                    type="button"
                    className={`clean-cat-btn ${category === cat.label ? 'active' : ''}`}
                    onClick={() => setCategory(cat.label)}
                  >
                    <span className="clean-cat-icon">{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Location */}
            <div className="clean-field">
              <label htmlFor="report-loc-input">Location / Landmark</label>
              <div className="clean-location-input-group">
                <input
                  id="report-loc-input"
                  type="text"
                  className="clean-input"
                  placeholder="Enter street, area, or tap on map..."
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="clean-gps-btn"
                  onClick={getGPSLocation}
                  disabled={gpsLoading}
                  title="Detect current location"
                >
                  {gpsLoading ? 'Detecting...' : '📍 My Location'}
                </button>
              </div>
            </div>

            {/* 3. Description */}
            <div className="clean-field">
              <label htmlFor="report-desc-input">Description</label>
              <textarea
                id="report-desc-input"
                className="clean-textarea"
                rows="4"
                placeholder="What is the problem? (e.g. big pothole blocking left lane, open drain...)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            {/* 4. Photo Evidence (Live Camera + File Upload) */}
            <div className="clean-field">
              <label>Photo Evidence (Live Camera or Upload)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                style={{ display: 'none' }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoChange}
                style={{ display: 'none' }}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {/* Live Camera Viewfinder */}
              {isCameraOpen ? (
                <div className="live-camera-container">
                  <div className="live-camera-header">
                    <div className="live-camera-status-info">
                      <span className="live-camera-indicator">
                        <span className="live-dot" /> LIVE
                      </span>
                      {activeCameraLabel && (
                        <span className="live-camera-chip" title={activeCameraLabel}>
                          📹 {activeCameraLabel} {cameraResolution ? `(${cameraResolution})` : ''}
                        </span>
                      )}
                    </div>

                    <div className="live-camera-top-actions">
                      {cameraDevices.length > 1 && (
                        <select
                          className="camera-device-select"
                          value={selectedCameraId}
                          onChange={handleCameraDeviceChange}
                          title="Switch connected camera device"
                        >
                          {cameraDevices.map((dev, i) => (
                            <option key={dev.deviceId || i} value={dev.deviceId}>
                              📷 {dev.label || `Camera ${i + 1}`}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        className="camera-ctrl-btn"
                        onClick={flipCamera}
                        title="Flip Front/Rear Camera"
                      >
                        🔄 Flip
                      </button>
                      <button
                        type="button"
                        className="camera-ctrl-btn close"
                        onClick={stopCamera}
                        title="Close Camera"
                      >
                        ✕ Close
                      </button>
                    </div>
                  </div>

                  <div className="live-camera-feed-wrap">
                    <video
                      ref={setVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="live-camera-feed"
                      onLoadedMetadata={(e) => {
                        const v = e.target
                        v.play().catch((err) => console.warn('Metadata play warning:', err))
                        if (v.videoWidth && v.videoHeight) {
                          setCameraResolution(`${v.videoWidth}x${v.videoHeight}`)
                        }
                        setCameraLoading(false)
                      }}
                      onPlaying={() => setCameraLoading(false)}
                    />

                    {/* Viewfinder Target HUD Overlay */}
                    <div className="camera-hud-overlay">
                      <div className="hud-corner top-left" />
                      <div className="hud-corner top-right" />
                      <div className="hud-corner bottom-left" />
                      <div className="hud-corner bottom-right" />
                      <div className="hud-crosshair" />
                    </div>

                    {isShutterFlashing && <div className="camera-shutter-flash" />}

                    {cameraLoading && (
                      <div className="camera-loading-overlay">
                        <div className="camera-spinner" />
                        <span>Starting camera feed...</span>
                      </div>
                    )}
                  </div>

                  {cameraError && (
                    <div className="camera-error-banner">
                      <div className="camera-error-title">
                        <span>⚠️ Camera Access Notice</span>
                      </div>
                      <p>{cameraError}</p>
                      <div className="camera-error-actions">
                        <button
                          type="button"
                          className="camera-error-retry-btn"
                          onClick={() => startCamera(cameraFacing, selectedCameraId)}
                        >
                          🔄 Retry Camera
                        </button>
                        <button
                          type="button"
                          className="camera-error-fallback-btn secondary"
                          onClick={() => {
                            stopCamera()
                            fileInputRef.current?.click()
                          }}
                        >
                          📁 Upload Image File
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="live-camera-controls">
                    <button
                      type="button"
                      className="camera-capture-btn"
                      onClick={captureCameraPhoto}
                      disabled={cameraLoading}
                      title="Capture photo evidence"
                    >
                      <span className="shutter-circle" />
                      <span>📸 Capture Photo</span>
                    </button>
                  </div>
                </div>
              ) : !photoPreview ? (
                <div className="photo-actions-container">
                  <div className="photo-actions-row">
                    <button
                      type="button"
                      className="clean-camera-btn"
                      onClick={handleCameraAction}
                    >
                      <span className="btn-icon">📸</span>
                      <div className="btn-text-block">
                        <span className="btn-title">Take Photo with Camera</span>
                        <span className="btn-sub">Open live viewfinder on PC, or camera app on phone</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="clean-upload-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <span className="btn-icon">📁</span>
                      <div className="btn-text-block">
                        <span className="btn-title">Upload Photo File</span>
                        <span className="btn-sub">Select image from gallery or disk</span>
                      </div>
                    </button>
                  </div>
                  <p className="photo-evidence-tip">
                    💡 <strong>Camera Tip:</strong> Tap <strong>"Take Photo with Camera"</strong> to capture evidence directly. On phones, it opens your camera app instantly; on laptops, it opens the live viewfinder.
                  </p>
                </div>
              ) : (
                <div className="clean-photo-preview">
                  <img src={photoPreview} alt="Evidence preview" />
                  <div className="clean-photo-overlay-actions">
                    <button
                      type="button"
                      className="clean-photo-remove"
                      onClick={removePhoto}
                    >
                      ✕ Retake / Remove Photo
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Clean Interactive Map */}
          <div className="report-clean-map-col">
            <div className="clean-map-header">
              <label>Pin Location on Map</label>
              <span className="clean-map-hint">Tap anywhere or drag pin to position</span>
            </div>

            <div className="clean-map-box">
              <MapContainer
                center={mapPosition}
                zoom={14}
                style={{ width: '100%', height: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapController
                  position={mapPosition}
                  onSelect={(lat, lng) => selectCoordinates(lat, lng)}
                />
                <DraggablePin
                  position={mapPosition}
                  onSelect={(lat, lng) => selectCoordinates(lat, lng)}
                />
              </MapContainer>
            </div>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`clean-banner ${messageType === 'success' ? 'success' : 'error'}`}>
            {message}
          </div>
        )}

        {/* Submit Bar */}
        <div className="clean-submit-bar">
          <button
            type="submit"
            className="primary-button clean-submit-btn"
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit Report →'}
          </button>
        </div>
      </form>

      {/* Duplicate Intercept Confirmation Modal */}
      {showDuplicateModal && primaryDuplicate && (
        <div className="duplicate-modal-overlay" onClick={() => setShowDuplicateModal(false)}>
          <div className="duplicate-modal" onClick={(e) => e.stopPropagation()}>
            <div className="duplicate-modal-header">
              <span className="duplicate-modal-icon">⚠️</span>
              <div>
                <h3>Complaint Already Registered!</h3>
                <span className="duplicate-modal-sub">
                  An identical civic issue has already been reported at this location
                </span>
              </div>
            </div>

            <div className="duplicate-modal-details">
              <div className="duplicate-modal-row">
                <span className="modal-label">Ticket ID:</span>
                <span className="modal-val highlight">#{primaryDuplicate.id || primaryDuplicate._id?.slice(-6)}</span>
              </div>
              <div className="duplicate-modal-row">
                <span className="modal-label">Issue:</span>
                <span className="modal-val">{primaryDuplicate.category}</span>
              </div>
              <div className="duplicate-modal-row">
                <span className="modal-label">Location:</span>
                <span className="modal-val">{primaryDuplicate.location}</span>
              </div>
              <div className="duplicate-modal-row">
                <span className="modal-label">Current Status:</span>
                <span className="modal-val status-tag">{primaryDuplicate.status || 'Submitted'}</span>
              </div>
              <div className="duplicate-modal-row">
                <span className="modal-label">Citizens Affected:</span>
                <span className="modal-val">👥 {primaryDuplicate.upvoteCount || 1} citizen(s)</span>
              </div>
              {primaryDuplicate.description && (
                <p className="duplicate-modal-desc">
                  "{primaryDuplicate.description}"
                </p>
              )}
            </div>

            <p className="duplicate-modal-hint">
              Submitting duplicate complaints clutters municipal records. Endorsing this existing ticket immediately notifies the assigned officers with elevated priority!
            </p>

            <div className="duplicate-modal-actions">
              <button
                type="button"
                className="duplicate-btn-endorse primary"
                disabled={endorsingId}
                onClick={() =>
                  handleEndorseExisting(primaryDuplicate._id || primaryDuplicate.id)
                }
              >
                {endorsingId ? 'Endorsing...' : '👍 Endorse Existing (+1) [Recommended]'}
              </button>
              <button
                type="button"
                className="duplicate-btn-bypass secondary"
                onClick={() => {
                  setShowDuplicateModal(false)
                  handleSubmit(null, true)
                }}
              >
                Submit as Separate Ticket Anyway
              </button>
              <button
                type="button"
                className="duplicate-btn-cancel"
                onClick={() => setShowDuplicateModal(false)}
              >
                Cancel & Review Form
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReportIssue
