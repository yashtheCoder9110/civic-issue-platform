
const express = require('express')
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const {
  authMiddleware,
  requireRole,
} = require('../middleware/authMiddleware')
const User = require('../models/User')
const Notification = require('../models/Notification')
const Complaint = require('../models/Complaint')

const router = express.Router()

const allowedStatuses = [
  'Submitted',
  'Pending',
  'AI Verified',
  'Assigned',
  'In Progress',
  'Resolved',
  'Rejected',
]

const allowedPriorities = ['Low', 'Medium', 'High', 'Urgent']
const allowedRiskLevels = ['Low', 'Moderate', 'High', 'Critical']

const civicIssueKeywords = [
  'road', 'pothole', 'street', 'traffic', 'signal',
  'water', 'drain', 'drainage', 'sewage', 'garbage',
  'waste', 'rubbish', 'electricity', 'electric', 'wire',
  'streetlight', 'street light', 'light', 'leak', 'leakage',
  'flood', 'flooding', 'manhole', 'footpath', 'sidewalk',
  'public toilet', 'sanitation', 'pollution', 'tree', 'park',
  'noise', 'construction', 'waterlogging', 'water logging',
]

function verifyAndSuggestComplaint(category, description, location) {
  const categoryText = String(category || '').trim()
  const descriptionText = String(description || '').trim()
  const locationText = String(location || '').trim()
  const combinedText = `${categoryText} ${descriptionText}`.toLowerCase()

  const matchedKeywords = civicIssueKeywords.filter((keyword) =>
    combinedText.includes(keyword)
  )

  const verificationReasons = []
  let verificationStatus = 'Verified'

  if (descriptionText.length < 20) {
    verificationStatus = 'Needs Review'
    verificationReasons.push(
      'The description is short. Add more detail about the issue and its impact.'
    )
  }

  if (matchedKeywords.length === 0) {
    verificationStatus = 'Needs Review'
    verificationReasons.push(
      'The report does not clearly match the built-in civic issue keywords.'
    )
  }

  if (!locationText) {
    verificationStatus = 'Needs Review'
    verificationReasons.push(
      'A clear location is needed so the issue can be investigated.'
    )
  }

  if (verificationReasons.length === 0) {
    verificationReasons.push(
      `The report contains a location and matches ${matchedKeywords.length} civic keyword(s). This initial check does not prove the complaint is genuine.`
    )
  }

  const urgentPatterns = [
    /\blive wire\b/i,
    /\bsparking wire\b/i,
    /\b(?:electric|electrical) wire (?:down|hanging|exposed)\b/i,
    /\bperson trapped\b/i,
    /\bbuilding (?:collapse|collapsing|collapsed)\b/i,
    /\bmajor gas leak\b/i,
    /\bopen manhole\b/i,
    /\bsevere flooding\b/i,
    /\bimmediate danger\b/i,
    /\blife.?threatening\b/i,
    /\bwire sparking\b/i,
    /\bfallen live wire\b/i,
  ]

  const highRiskPatterns = [
    /\bdeep pothole\b/i,
    /\broad collapse\b/i,
    /\bsewage overflow\b/i,
    /\bcontaminated water\b/i,
    /\bwater supply contaminated\b/i,
    /\bexposed wire\b/i,
    /\bblocked emergency access\b/i,
    /\bheavy flooding\b/i,
    /\bdangerous\b/i,
    /\binjury\b/i,
    /\bunsafe area\b/i,
    /\bdangerous road\b/i,
    /\broad is completely dark\b/i,
    /\bno street lighting\b/i,
    /\bstreet(?:light| light).{0,35}\b(?:accident|unsafe|dangerous|dark road)\b/i,
    /\b(?:accident|unsafe|dangerous|dark road).{0,35}\bstreet(?:light| light)\b/i,
  ]

  const moderatePatterns = [
    /\bleak\b/i,
    /\bleakage\b/i,
    /\bdrain\b/i,
    /\bpothole\b/i,
    /\bstreetlight\b/i,
    /\bstreet light\b/i,
    /\bgarbage\b/i,
    /\bwaste\b/i,
    /\bwaterlogging\b/i,
    /\bbroken light\b/i,
    /\bnot working\b/i,
    /\bdoes not work\b/i,
  ]

  let aiRiskLevel = 'Low'
  let aiRiskReason =
    'No built-in high-risk indicators were detected. An officer should confirm the actual impact.'
  let aiSuggestedPriority = 'Low'
  let aiPriorityReason =
    'No built-in high-priority indicators were detected. An officer should confirm the actual impact.'

  if (urgentPatterns.some((pattern) => pattern.test(combinedText))) {
    aiRiskLevel = 'Critical'
    aiRiskReason =
      'The report contains a possible immediate safety hazard. Verify promptly and follow appropriate emergency procedures.'
    aiSuggestedPriority = 'Urgent'
    aiPriorityReason =
      'The report contains a possible immediate safety hazard.'
  } else if (highRiskPatterns.some((pattern) => pattern.test(combinedText))) {
    aiRiskLevel = 'High'
    aiRiskReason =
      'The report may involve a safety hazard or significant disruption to public services.'
    aiSuggestedPriority = 'High'
    aiPriorityReason =
      'The report contains a possible safety concern or significant public-service issue.'
  } else if (moderatePatterns.some((pattern) => pattern.test(combinedText))) {
    aiRiskLevel = 'Moderate'
    aiRiskReason =
      'The report describes a civic service issue that may affect local access or daily services.'
    aiSuggestedPriority = 'Medium'
    aiPriorityReason =
      'The reported issue may affect public access or routine civic services.'
  }

  if (
    descriptionText.length < 20 ||
    matchedKeywords.length === 0 ||
    !locationText
  ) {
    if (aiRiskLevel === 'Low') {
      aiRiskReason =
        'There is not enough clear information to estimate risk confidently. Review the description and location.'
    }
  }

  return {
    aiVerificationStatus: verificationStatus,
    aiVerificationReason: verificationReasons.join(' '),
    aiSuggestedPriority,
    aiPriorityReason,
    aiMatchedKeywords: matchedKeywords,
    aiRiskLevel,
    aiRiskReason,
    aiReviewedAt: new Date().toISOString(),
  }
}

// Build a consistent audit entry for each real change.
function makeActivityEntry({
  field,
  previousValue,
  newValue,
  now,
  actor,
}) {
  return {
    field,
    previousValue: previousValue ?? '',
    newValue: newValue ?? '',
    changedAt: now,
    changedBy: {
      userId: actor._id.toString(),
      name: actor.name,
      email: actor.email,
      role: actor.role,
    },
  }
}

const complaintSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    submittedBy: { type: String, default: 'Unknown' },
    submittedByEmail: { type: String, required: true, index: true },
    submittedByRole: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    location: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    photoName: { type: String, default: '' },
    photoData: { type: String, default: '' },

    status: {
      type: String,
      enum: allowedStatuses,
      default: 'Submitted',
    },
    priority: {
      type: String,
      enum: allowedPriorities,
      default: 'Medium',
    },

    aiVerificationStatus: {
      type: String,
      enum: ['Verified', 'Needs Review'],
      default: 'Needs Review',
    },
    aiVerificationReason: { type: String, default: '' },
    aiSuggestedPriority: {
      type: String,
      enum: allowedPriorities,
      default: 'Medium',
    },
    aiPriorityReason: { type: String, default: '' },
    aiMatchedKeywords: { type: [String], default: [] },
    aiRiskLevel: {
      type: String,
      enum: allowedRiskLevels,
      default: 'Low',
    },
    aiRiskReason: { type: String, default: '' },
    aiReviewedAt: { type: String, default: null },

    // Keep the officer name for dashboard compatibility.
    assignedOfficer: { type: String, default: '' },

    // The actual registered officer's MongoDB user ID.
    assignedOfficerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    assignedAt: { type: String, default: null },
    createdAt: { type: String, required: true },

    upvotes: {
      type: [String],
      default: [],
    },
    upvoteCount: {
      type: Number,
      default: 1,
    },
    clusterId: {
      type: String,
      default: '',
    },

    // Existing status-only history; retained for compatibility.
    statusHistory: {
      type: [
        {
          status: { type: String, required: true },
          date: { type: String, required: true },
          _id: false,
        },
      ],
      default: [],
    },

    // New audit trail for status, priority, and assignment changes.
    activityHistory: {
      type: [
        {
          field: {
            type: String,
            enum: ['status', 'priority', 'assignment'],
            required: true,
          },
          previousValue: { type: String, default: '' },
          newValue: { type: String, default: '' },
          changedAt: { type: String, required: true },
          changedBy: {
            userId: { type: String, required: true },
            name: { type: String, required: true },
            email: { type: String, required: true },
            role: { type: String, required: true },
            _id: false,
          },
          _id: false,
        },
      ],
      default: [],
    },
  },
  {
    versionKey: false,
    collection: 'complaints',
  }
)

// Complaint model loaded from ../models/Complaint

function sendServerError(res, error) {
  console.error('Complaint API error:', error)
  return res.status(500).json({
    success: false,
    message: 'A server error occurred while processing the complaint.',
  })
}

// GET /api/issues/officers
router.get(
  '/officers',
  authMiddleware,
  requireRole('Officer'),
  async (req, res) => {
    try {
      const officers = await User.find({ role: 'Officer' })
        .select('_id name email')
        .sort({ name: 1 })
        .lean()

      return res.status(200).json({
        success: true,
        officers: officers.map((officer) => ({
          id: officer._id.toString(),
          name: officer.name,
          email: officer.email,
        })),
      })
    } catch (error) {
      return sendServerError(res, error)
    }
  }
)

// POST /api/issues
router.post(
  '/',
  authMiddleware,
  requireRole('Citizen'),
  async (req, res) => {
    try {
      const {
        category,
        description,
        location,
        latitude,
        longitude,
        photoName,
        photoData,
      } = req.body || {}

      if (
        typeof category !== 'string' ||
        !category.trim() ||
        typeof description !== 'string' ||
        description.trim().length < 10 ||
        typeof location !== 'string' ||
        !location.trim() ||
        typeof latitude !== 'number' ||
        typeof longitude !== 'number' ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      ) {
        return res.status(400).json({
          success: false,
          message: 'Please provide valid complaint details and coordinates.',
        })
      }

      if (
        photoData !== undefined &&
        photoData !== '' &&
        (typeof photoData !== 'string' ||
          !photoData.startsWith('data:image/'))
      ) {
        return res.status(400).json({
          success: false,
          message: 'The uploaded photo data is invalid.',
        })
      }

      if (photoName !== undefined && typeof photoName !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'The photo name must be text.',
        })
      }

      const user = await User.findById(req.user.userId)

      if (!user || user.role !== 'Citizen') {
        return res.status(401).json({
          success: false,
          message: 'Your account could not be verified. Please sign in again.',
        })
      }

      const now = new Date().toISOString()
      const aiAssessment = verifyAndSuggestComplaint(
        category.trim(),
        description.trim(),
        location.trim()
      )

      const complaint = await Complaint.create({
        id: `CIV-${Date.now().toString().slice(-6)}-${Math.random()
          .toString(36)
          .slice(2, 6)
          .toUpperCase()}`,
        submittedBy: user.name,
        submittedByEmail: user.email,
        submittedByRole: user.role,
        category: category.trim(),
        description: description.trim(),
        location: location.trim(),
        latitude,
        longitude,
        photoName: photoName || '',
        photoData: photoData || '',
        status: 'Submitted',
        priority: 'Medium',
        ...aiAssessment,
        assignedOfficer: '',
        assignedOfficerId: null,
        assignedAt: null,
        createdAt: now,
        statusHistory: [{ status: 'Submitted', date: now }],
        activityHistory: [],
      })

      return res.status(201).json({
        success: true,
        message:
          'Complaint submitted successfully. Initial verification, risk screening, and priority suggestions are available for review.',
        complaint: complaint.toObject(),
      })
    } catch (error) {
      return sendServerError(res, error)
    }
  }
)

// GET /api/issues
router.get('/', authMiddleware, async (req, res) => {
  try {
    let filter = {}
    const isPublicScope = req.query.scope === 'public' || req.query.all === 'true'

    if (req.user.role === 'Citizen') {
      const user = await User.findById(req.user.userId).select('email')

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Account not found. Please sign in again.',
        })
      }

      // If user requests public community issues (e.g. for duplicate detection or tracking), don't filter by user email
      if (!isPublicScope) {
        filter = { submittedByEmail: user.email }
      }
    } else if (req.user.role !== 'Officer') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view complaints.',
      })
    }

    const complaints = await Complaint.find(filter)
      .sort({ _id: -1 })
      .lean()

    return res.status(200).json({
      success: true,
      complaints,
    })
  } catch (error) {
    return sendServerError(res, error)
  }
})

// PATCH /api/issues/:id
router.patch(
  '/:id',
  authMiddleware,
  requireRole('Officer'),
  async (req, res) => {
    try {
      const complaintId = req.params.id

      const query = mongoose.isValidObjectId(complaintId)
        ? { $or: [{ _id: complaintId }, { id: complaintId }] }
        : { id: complaintId }

      const complaint = await Complaint.findOne(query)

      if (!complaint) {
        return res.status(404).json({
          success: false,
          message: 'Complaint not found.',
        })
      }

      const body = req.body || {}
      const allowedFields = [
        'status',
        'priority',
        'assignedOfficer',
        'assignedOfficerId',
      ]
      const requestedFields = Object.keys(body)

      if (
        requestedFields.length === 0 ||
        requestedFields.some((field) => !allowedFields.includes(field))
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Provide only status, priority, assignedOfficer, or assignedOfficerId to update.',
        })
      }

      if (
        Object.prototype.hasOwnProperty.call(body, 'status') &&
        (typeof body.status !== 'string' ||
          !allowedStatuses.includes(body.status))
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid complaint status.',
        })
      }

      if (
        Object.prototype.hasOwnProperty.call(body, 'priority') &&
        (typeof body.priority !== 'string' ||
          !allowedPriorities.includes(body.priority))
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid complaint priority.',
        })
      }

      const hasOfficerId = Object.prototype.hasOwnProperty.call(
        body,
        'assignedOfficerId'
      )
      const hasOfficerName = Object.prototype.hasOwnProperty.call(
        body,
        'assignedOfficer'
      )

      let selectedOfficer = null

      if (hasOfficerId) {
        if (
          body.assignedOfficerId === '' ||
          body.assignedOfficerId === null
        ) {
          selectedOfficer = null
        } else {
          if (
            typeof body.assignedOfficerId !== 'string' ||
            !mongoose.isValidObjectId(body.assignedOfficerId)
          ) {
            return res.status(400).json({
              success: false,
              message: 'A valid officer ID is required.',
            })
          }

          selectedOfficer = await User.findOne({
            _id: body.assignedOfficerId,
            role: 'Officer',
          }).select('_id name email')

          if (!selectedOfficer) {
            return res.status(400).json({
              success: false,
              message: 'The selected officer account does not exist.',
            })
          }
        }
      } else if (hasOfficerName) {
        // Compatibility with clients that send an officer name.
        if (
          typeof body.assignedOfficer !== 'string' ||
          body.assignedOfficer.trim().length > 100
        ) {
          return res.status(400).json({
            success: false,
            message: 'Assigned officer must be text of at most 100 characters.',
          })
        }

        const requestedName = body.assignedOfficer.trim()

        if (requestedName) {
          const escapedName = requestedName.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
          )

          const matchingOfficers = await User.find({
            role: 'Officer',
            name: { $regex: `^${escapedName}$`, $options: 'i' },
          }).select('_id name email')

          if (matchingOfficers.length === 0) {
            return res.status(400).json({
              success: false,
              message:
                'No registered officer has that name. Choose a registered officer.',
            })
          }

          if (matchingOfficers.length > 1) {
            return res.status(400).json({
              success: false,
              message:
                'More than one officer has that name. Use officer selection by ID.',
            })
          }

          selectedOfficer = matchingOfficers[0]
        }
      }

      // Verify the authenticated officer and capture their identity
      // from MongoDB rather than trusting identity supplied by the client.
      const actor = await User.findOne({
        _id: req.user.userId,
        role: 'Officer',
      }).select('_id name email role')

      if (!actor) {
        return res.status(401).json({
          success: false,
          message: 'Officer account not found. Please sign in again.',
        })
      }

      const now = new Date().toISOString()
      const activityEntries = []

      const previousStatus = complaint.status || 'Submitted'
      const previousPriority = complaint.priority || 'Medium'
      const previousOfficerId = complaint.assignedOfficerId
        ? complaint.assignedOfficerId.toString()
        : ''
      const previousOfficerName = complaint.assignedOfficer || ''

      const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status')
      const hasPriority = Object.prototype.hasOwnProperty.call(body, 'priority')

      const statusChanged = hasStatus && body.status !== previousStatus
      const priorityChanged = hasPriority && body.priority !== previousPriority

      if (statusChanged) {
        complaint.statusHistory.push({
          status: body.status,
          date: now,
        })

        activityEntries.push(
          makeActivityEntry({
            field: 'status',
            previousValue: previousStatus,
            newValue: body.status,
            now,
            actor,
          })
        )

        complaint.status = body.status
      }

      if (priorityChanged) {
        activityEntries.push(
          makeActivityEntry({
            field: 'priority',
            previousValue: previousPriority,
            newValue: body.priority,
            now,
            actor,
          })
        )

        complaint.priority = body.priority
      }

      if (hasOfficerId || hasOfficerName) {
        const nextOfficerId = selectedOfficer
          ? selectedOfficer._id.toString()
          : ''
        const nextOfficerName = selectedOfficer
          ? selectedOfficer.name
          : ''

        const assignmentChanged =
          nextOfficerId !== previousOfficerId ||
          nextOfficerName !== previousOfficerName

        if (assignmentChanged) {
          activityEntries.push(
            makeActivityEntry({
              field: 'assignment',
              previousValue: previousOfficerName || 'Unassigned',
              newValue: nextOfficerName || 'Unassigned',
              now,
              actor,
            })
          )

          complaint.assignedOfficerId = selectedOfficer
            ? selectedOfficer._id
            : null
          complaint.assignedOfficer = nextOfficerName
          complaint.assignedAt = selectedOfficer ? now : null
        }
      }

      if (activityEntries.length > 0) {
        complaint.activityHistory.push(...activityEntries)
      }

      await complaint.save()

      // Notify the citizen when status actually changes.
      if (statusChanged) {
        try {
          await Notification.create({
            recipientEmail: complaint.submittedByEmail,
            complaintId: complaint.id,
            message: `Your ${complaint.category} complaint (${complaint.id}) status changed from ${previousStatus} to ${complaint.status}.`,
            oldStatus: previousStatus,
            newStatus: complaint.status,
            isRead: false,
            createdAt: new Date(now),
          })
        } catch (notificationError) {
          console.error(
            'Failed to create complaint status notification:',
            notificationError
          )
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Complaint updated successfully.',
        complaint: complaint.toObject(),
      })
    } catch (error) {
      return sendServerError(res, error)
    }
  }
)

// POST /api/issues/:id/upvote - Citizen / Guest upvoting a nearby / duplicate issue ("Me Too!")
router.post('/:id/upvote', async (req, res) => {
  try {
    const complaintId = req.params.id
    let voterId = 'anon_' + (req.ip || 'citizen_' + Math.random().toString(36).slice(2, 8))

    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7)
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        if (decoded?.userId) {
          const user = await User.findById(decoded.userId).select('email name')
          if (user?.email) voterId = user.email.toLowerCase()
        }
      } catch {}
    } else if (req.body?.email) {
      voterId = req.body.email.toLowerCase()
    }

    const query = mongoose.isValidObjectId(complaintId)
      ? { $or: [{ _id: complaintId }, { id: complaintId }] }
      : { id: complaintId }

    const complaint = await Complaint.findOne(query)
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' })
    }

    if (!complaint.upvotes) complaint.upvotes = []

    const alreadyVoted = complaint.upvotes.includes(voterId)
    if (alreadyVoted) {
      return res.status(200).json({
        success: true,
        alreadyUpvoted: true,
        message: 'You have already endorsed this issue.',
        upvoteCount: complaint.upvoteCount || complaint.upvotes.length || 1,
        complaint: complaint.toObject(),
      })
    }

    complaint.upvotes.push(voterId)
    complaint.upvoteCount = (complaint.upvoteCount || 1) + 1

    // Automatically elevate priority if multiple community members report / endorse it
    if (complaint.upvoteCount >= 8 && complaint.priority !== 'Urgent') {
      complaint.priority = 'Urgent'
    } else if (complaint.upvoteCount >= 4 && complaint.priority === 'Low') {
      complaint.priority = 'Medium'
    }

    await complaint.save()

    return res.status(200).json({
      success: true,
      alreadyUpvoted: false,
      message: '✓ Endorsement recorded! Municipal officers have been notified that multiple citizens are affected.',
      upvoteCount: complaint.upvoteCount,
      complaint: complaint.toObject(),
    })
  } catch (error) {
    return sendServerError(res, error)
  }
})

// POST /api/issues/cluster/resolve - Officer bulk action to resolve clustered duplicate complaints
router.post(
  '/cluster/resolve',
  authMiddleware,
  requireRole('Officer'),
  async (req, res) => {
    try {
      const { complaintIds, status = 'Resolved', priority, assignedOfficer, assignedOfficerId, resolutionNotes } = req.body || {}

      if (!Array.isArray(complaintIds) || complaintIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a list of complaint IDs to update.',
        })
      }

      let officer = null
      if (req.user?.userId) {
        officer = await User.findById(req.user.userId)
      }
      const officerInfo = {
        userId: officer ? officer._id.toString() : 'system_officer',
        name: officer ? officer.name : 'Municipal Officer',
        email: officer ? officer.email : 'officer@civicconnect.local',
        role: 'Officer',
      }

      const now = new Date().toISOString()

      const query = {
        $or: [
          { _id: { $in: complaintIds.filter((id) => mongoose.isValidObjectId(id)) } },
          { id: { $in: complaintIds } },
        ],
      }

      const matchingComplaints = await Complaint.find(query)

      for (const comp of matchingComplaints) {
        const prevStatus = comp.status
        comp.status = status
        if (!comp.statusHistory) comp.statusHistory = []
        comp.statusHistory.push({ status, date: now })
        if (priority && allowedPriorities.includes(priority)) comp.priority = priority
        if (assignedOfficer) comp.assignedOfficer = assignedOfficer
        if (assignedOfficerId) comp.assignedOfficerId = assignedOfficerId

        if (!comp.activityHistory) comp.activityHistory = []
        comp.activityHistory.push({
          field: 'status',
          previousValue: prevStatus,
          newValue: status,
          changedAt: now,
          changedBy: officerInfo,
        })
        await comp.save()
      }

      return res.status(200).json({
        success: true,
        message: `Successfully resolved ${matchingComplaints.length} clustered duplicate complaints!`,
        resolvedCount: matchingComplaints.length,
      })
    } catch (error) {
      return sendServerError(res, error)
    }
  }
)

module.exports = router

    