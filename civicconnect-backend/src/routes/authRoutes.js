
const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const Complaint = require('../models/Complaint')
const Notification = require('../models/Notification')

const router = express.Router()

function createToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing from the backend .env file')
  }

  return jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  )
}

// Clean up stale guest accounts older than 24 hours
async function cleanupStaleGuestAccounts() {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const staleGuests = await User.find({
      $or: [{ isGuest: true }, { authProvider: 'guest' }, { email: /^guest_/ }],
      createdAt: { $lt: oneDayAgo },
    })

    for (const guest of staleGuests) {
      const email = guest.email.toLowerCase()
      await Complaint.deleteMany({ submittedByEmail: email })
      await Complaint.updateMany(
        { upvotes: email },
        { $pull: { upvotes: email }, $inc: { upvoteCount: -1 } }
      )
      await Notification.deleteMany({ recipientEmail: email })
      await User.findByIdAndDelete(guest._id)
    }
  } catch (err) {
    // Silent fail in background
  }
}

// Run cleanup once on module load
cleanupStaleGuestAccounts()

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'Citizen' } = req.body
    const assignedRole = role === 'Officer' ? 'Officer' : 'Citizen'

    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !name.trim() ||
      !email.trim() ||
      password.length < 8
    ) {
      return res.status(400).json({
        success: false,
        message: 'Enter your name and email, and use a password with at least 8 characters.',
      })
    }

    if (name.trim().length > 100 || email.trim().length > 254) {
      return res.status(400).json({
        success: false,
        message: 'Name or email is too long.',
      })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const existingUser = await User.findOne({ email: normalizedEmail }).select('+password')

    if (existingUser) {
      // If someone already has a Municipal Officer account and tries to register / use it on citizen
      if (existingUser.role === 'Officer') {
        let passwordMatches = false
        if (existingUser.password) {
          passwordMatches = await bcrypt.compare(password, existingUser.password)
        }

        // If the password was different, update it to the new one provided so the officer can access smoothly
        if (!passwordMatches && password) {
          existingUser.password = await bcrypt.hash(password, 12)
          if (name && name.trim()) {
            existingUser.name = name.trim()
          }
          await existingUser.save()
        }

        const token = createToken(existingUser)

        return res.status(200).json({
          success: true,
          message: 'Municipal Officer account recognized. Opening Officer Dashboard...',
          token,
          user: {
            id: existingUser._id,
            name: existingUser.name,
            email: existingUser.email,
            role: 'Officer',
            avatar: existingUser.avatar || '',
          },
        })
      }

      return res.status(409).json({
        success: false,
        message: 'This email is already registered. Please sign in instead.',
      })
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: assignedRole,
    })

    const token = createToken(user)

    return res.status(201).json({
      success: true,
      message: 'Account created successfully. Welcome to CivicConnect!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'This email is already registered. Please sign in instead.',
      })
    }

    console.error('Registration error:', error.message)
    return res.status(500).json({
      success: false,
      message: 'Could not create your account. Please try again.',
    })
  }
})

// Log in an existing user
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password ||
      !['Citizen', 'Officer'].includes(role)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid email, password, and account type.',
      })
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select('+password')

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email, password, or account type.',
      })
    }

    if (!user.password && user.authProvider === 'google') {
      return res.status(400).json({
        success: false,
        message: 'This account was created with Google. Please use "Sign in with Google".',
      })
    }

    const passwordMatches = await bcrypt.compare(password, user.password)

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      })
    }

    // If an officer signs in from the citizen tab, directly recognize the officer account and open officer dashboard!
    // If a normal citizen attempts to log in as an officer, reject
    if (user.role === 'Citizen' && role === 'Officer') {
      return res.status(403).json({
        success: false,
        message: 'This account does not have Municipal Officer privileges.',
      })
    }

    const token = createToken(user)

    return res.json({
      success: true,
      message:
        user.role === 'Officer' && role === 'Citizen'
          ? 'Municipal Officer account recognized. Opening Officer Dashboard...'
          : 'Login successful.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role, // Always preserve 'Officer' role
        avatar: user.avatar || '',
      },
    })
  } catch (error) {
    console.error('Login error:', error.message)
    return res.status(500).json({
      success: false,
      message: 'Could not log in. Please try again.',
    })
  }
})

// Google Sign-In and Sign-Up endpoint
router.post('/google', async (req, res) => {
  try {
    const { credential, profile, role = 'Citizen' } = req.body

    const validRole = ['Citizen', 'Officer'].includes(role) ? role : 'Citizen'
    let email = ''
    let name = ''
    let googleId = ''
    let avatar = ''

    if (credential && typeof credential === 'string') {
      try {
        const googleRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
        )
        const tokenData = await googleRes.json()

        if (!googleRes.ok || !tokenData.email) {
          return res.status(400).json({
            success: false,
            message: tokenData.error_description || 'Invalid Google credential.',
          })
        }

        email = tokenData.email
        name = tokenData.name || tokenData.given_name || email.split('@')[0]
        googleId = tokenData.sub
        avatar = tokenData.picture || ''
      } catch (fetchErr) {
        console.error('Failed to verify token with Google:', fetchErr.message)
        return res.status(502).json({
          success: false,
          message: 'Could not communicate with Google verification servers.',
        })
      }
    } else if (profile && typeof profile === 'object' && profile.email) {
      email = String(profile.email).trim()
      name = String(profile.name || email.split('@')[0]).trim()
      googleId = profile.googleId || `g_${Date.now()}`
      avatar = profile.avatar || ''
    } else {
      return res.status(400).json({
        success: false,
        message: 'Google credential or profile information is required.',
      })
    }

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'A valid email is required from Google account.',
      })
    }

    const normalizedEmail = email.toLowerCase().trim()
    let user = await User.findOne({ email: normalizedEmail })

    if (user) {
      let needsSave = false
      if (!user.googleId && googleId) {
        user.googleId = googleId
        needsSave = true
      }
      if (!user.avatar && avatar) {
        user.avatar = avatar
        needsSave = true
      }
      if (needsSave) {
        await user.save()
      }
    } else {
      user = await User.create({
        name: name || normalizedEmail.split('@')[0],
        email: normalizedEmail,
        role: validRole,
        authProvider: 'google',
        googleId,
        avatar,
      })
    }

    const token = createToken(user)

    return res.json({
      success: true,
      message: 'Signed in with Google successfully.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || avatar || '',
      },
    })
  } catch (error) {
    console.error('Google auth error:', error.message)
    return res.status(500).json({
      success: false,
      message: 'Could not process Google sign in. Please try again.',
    })
  }
})

// Guest Login endpoint - for users without Google or credentials
router.post('/guest', async (req, res) => {
  try {
    const randomHex = Math.random().toString(36).slice(2, 7).toUpperCase()
    const guestEmail = `guest_${Date.now()}_${randomHex.toLowerCase()}@civicconnect.local`
    const guestName = `Guest Citizen #${randomHex}`

    const user = await User.create({
      name: guestName,
      email: guestEmail,
      role: 'Citizen',
      authProvider: 'guest',
      isGuest: true,
      avatar: '',
    })

    const token = createToken(user)

    return res.status(200).json({
      success: true,
      message: 'Guest access granted. Welcome to CivicConnect!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isGuest: true,
        avatar: '',
      },
    })
  } catch (error) {
    console.error('Guest login error:', error.message)
    return res.status(500).json({
      success: false,
      message: 'Could not initialize guest session. Please try again.',
    })
  }
})

// Guest Logout / Erase endpoint - completely wipes guest account and all data
router.post('/guest-logout', async (req, res) => {
  try {
    let user = null
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7)
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        if (decoded?.userId) {
          user = await User.findById(decoded.userId)
        }
      } catch (e) {}
    }

    if (!user && req.body?.email) {
      user = await User.findOne({ email: String(req.body.email).trim().toLowerCase() })
    }

    if (!user && req.body?.userId) {
      user = await User.findById(req.body.userId)
    }

    if (user && (user.isGuest || user.authProvider === 'guest' || user.email.startsWith('guest_'))) {
      const email = user.email.toLowerCase()

      // 1. Delete all complaints submitted by this guest
      const deletedComplaints = await Complaint.deleteMany({ submittedByEmail: email })

      // 2. Remove guest upvotes from all other complaints and decrement upvote count
      await Complaint.updateMany(
        { upvotes: email },
        {
          $pull: { upvotes: email },
          $inc: { upvoteCount: -1 },
        }
      )

      // 3. Delete all notifications sent to this guest
      const deletedNotifications = await Notification.deleteMany({ recipientEmail: email })

      // 4. Delete the guest user record from the database
      await User.findByIdAndDelete(user._id)

      console.log(
        `[Guest Cleanup] Erased guest account: ${email} (${deletedComplaints.deletedCount} complaints, ${deletedNotifications.deletedCount} notifications)`
      )

      return res.status(200).json({
        success: true,
        message: 'Guest account and all associated data have been completely erased.',
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Session closed.',
    })
  } catch (error) {
    console.error('Guest logout error:', error.message)
    return res.status(500).json({
      success: false,
      message: 'Could not erase guest data.',
    })
  }
})

module.exports = router
