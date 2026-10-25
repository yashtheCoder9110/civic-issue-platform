const mongoose = require('mongoose')

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

    assignedOfficer: { type: String, default: '' },
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

module.exports =
  mongoose.models.Complaint ||
  mongoose.model('Complaint', complaintSchema)
