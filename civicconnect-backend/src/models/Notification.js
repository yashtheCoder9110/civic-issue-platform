const mongoose = require('mongoose')

const notificationSchema = new mongoose.Schema(
  {
    recipientEmail: {
      type: String,
      required: true,
      index: true,
    },
    complaintId: {
      type: String,
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
    },
    oldStatus: {
      type: String,
      required: true,
    },
    newStatus: {
      type: String,
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
    collection: 'notifications',
  }
)

module.exports =
  mongoose.models.Notification ||
  mongoose.model('Notification', notificationSchema)
