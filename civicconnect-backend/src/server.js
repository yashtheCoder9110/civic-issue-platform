const dns = require('dns');
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (e) {}

const express = require('express')
const cors = require('cors')
require('dotenv').config()
const mongoose = require('mongoose')

const healthRoutes = require('./routes/healthRoutes')
const issueRoutes = require('./routes/issueRoutes')
const authRoutes = require('./routes/authRoutes')
const notificationRoutes = require('./routes/notificationRoutes')

const app = express()
const PORT = process.env.PORT || 5000
const FRONTEND_URL =
  process.env.FRONTEND_URL || 'http://localhost:5176'

// Allow requests from localhost and local network devices (e.g. phones on 192.168.x.x)
app.use(
  cors({
    origin: true,
    credentials: true,
  })
)

// Allow JSON requests, including base64 complaint photos.
app.use(express.json({ limit: '15mb' }))

// Basic API health message.
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the CivicConnect API',
    status: 'running',
  })
})

// API routes.
app.use('/api/health', healthRoutes)
app.use('/api/issues', issueRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/notifications', notificationRoutes)

// Handle unknown endpoints.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
  })
})

// Handle malformed JSON and other request-processing errors.
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err)
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON request body',
    })
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Request body is too large. Please use a smaller photo.',
    })
  }

  console.error('API error:', err.message)

  return res.status(500).json({
    success: false,
    message: 'An unexpected server error occurred',
  })
})

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error(
        'MONGODB_URI is missing from the backend .env file'
      )
    }

    await mongoose.connect(process.env.MONGODB_URI)

    console.log('MongoDB connected successfully')
    console.log('Allowed frontend:', FRONTEND_URL)

    app.listen(PORT, () => {
      console.log(
        `CivicConnect backend running at http://localhost:${PORT}`
      )
    })
  } catch (error) {
    console.error(
      'Failed to start CivicConnect backend:',
      error.message
    )
    process.exit(1)
  }
}

startServer()
