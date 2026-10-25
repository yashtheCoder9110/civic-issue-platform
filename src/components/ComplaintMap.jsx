
import { useEffect, useState, useCallback } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

const markerShadow =
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'

const createIcon = (color) =>
  new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  })

const submittedIcon = createIcon('red')
const progressIcon = createIcon('orange')
const resolvedIcon = createIcon('green')

function AutoZoom({ complaints }) {
  const map = useMap()

  useEffect(() => {
    if (complaints.length === 0) return

    const locations = complaints.map((complaint) => [
      Number(complaint.latitude),
      Number(complaint.longitude),
    ])

    if (locations.length === 1) {
      map.setView(locations[0], 15)
    } else {
      map.fitBounds(locations, {
        padding: [30, 30],
        maxZoom: 15,
      })
    }
  }, [map, complaints])

  return null
}

function ComplaintMap() {
  const [complaints, setComplaints] = useState([])

  const loadComplaints = useCallback(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem('complaints') || '[]'
      )

      const validComplaints = Array.isArray(saved)
        ? saved.filter((complaint) => {
            const lat = Number(complaint.latitude)
            const lng = Number(complaint.longitude)

            return (
              complaint.latitude !== null &&
              complaint.latitude !== '' &&
              complaint.longitude !== null &&
              complaint.longitude !== '' &&
              Number.isFinite(lat) &&
              Number.isFinite(lng) &&
              lat >= -90 &&
              lat <= 90 &&
              lng >= -180 &&
              lng <= 180 &&
              (lat !== 0 || lng !== 0)
            )
          })
        : []

      setComplaints(validComplaints)
    } catch {
      setComplaints([])
    }
  }, [])

  useEffect(() => {
    loadComplaints()

    window.addEventListener('focus', loadComplaints)
    window.addEventListener('storage', loadComplaints)

    return () => {
      window.removeEventListener('focus', loadComplaints)
      window.removeEventListener('storage', loadComplaints)
    }
  }, [loadComplaints])

  return (
    <div className="complaint-map">
      <div className="map-legend">
        <strong>Complaint Status:</strong>
        <span>🔴 Submitted</span>
        <span>🟠 In Progress</span>
        <span>🟢 Resolved</span>
      </div>

      <div className="map-container">
        <MapContainer
          center={[19.076, 72.8777]}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <AutoZoom complaints={complaints} />

          {complaints.map((complaint, index) => (
            <Marker
              key={complaint.id ?? index}
              position={[
                Number(complaint.latitude),
                Number(complaint.longitude),
              ]}
              icon={
                complaint.status === 'Resolved'
                  ? resolvedIcon
                  : complaint.status === 'In Progress'
                    ? progressIcon
                    : submittedIcon
              }
            >
              <Popup>
                <strong>{complaint.category || 'Civic Issue'}</strong>
                <br />
                <strong>Complaint ID:</strong>{' '}
                {complaint.id ?? 'Unavailable'}
                <br />
                <strong>Address:</strong>{' '}
                {complaint.location || 'Location not provided'}
                <br />
                <strong>Status:</strong>{' '}
                {complaint.status || 'Submitted'}
                <br />
                <strong>Description:</strong>{' '}
                {complaint.description || 'No description provided'}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <p className="map-count">
        Showing {complaints.length} complaint
        {complaints.length === 1 ? '' : 's'} with valid coordinates.
      </p>
    </div>
  )
}

export default ComplaintMap
