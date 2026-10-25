
const jwt = require('jsonwebtoken')
const User = require('../models/User')

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Please sign in to access this resource.',
    })
  }

  const token = authHeader.slice(7)

  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is missing from the backend .env file')

    return res.status(500).json({
      success: false,
      message: 'Server authentication is not configured.',
    })
  }

  let decoded

  // Step 1: Verify the token
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET)
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Your session is invalid or expired. Please sign in again.',
    })
  }

  if (!decoded.userId || !decoded.role) {
    return res.status(401).json({
      success: false,
      message: 'Invalid session. Please sign in again.',
    })
  }

  // Step 2: Check the user's current account and role in MongoDB
  try {
    const user = await User.findById(decoded.userId).select('_id role')

    if (!user || user.role !== decoded.role) {
      return res.status(401).json({
        success: false,
        message: 'Your account or permissions have changed. Please sign in again.',
      })
    }

    req.user = {
      userId: user._id.toString(),
      role: user.role,
    }

    return next()
  } catch (error) {
    console.error('Authentication database check failed:', error.message)

    return res.status(500).json({
      success: false,
      message: 'Could not verify your account. Please try again.',
    })
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.',
      })
    }

    next()
  }
}

module.exports = {
  authMiddleware,
  requireRole,
}
