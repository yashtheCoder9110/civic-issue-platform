const express = require('express')
const mongoose = require('mongoose')
const {
  authMiddleware,
  requireRole,
} = require('../middleware/authMiddleware')
const User = require('../models/User')
const Notification = require('../models/Notification')

const router = express.Router()

// GET /api/notifications
// Citizens can retrieve only notifications addressed to their account.
router.get(
  '/',
  authMiddleware,
  requireRole('Citizen'),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.userId).select('email')

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Account not found. Please sign in again.',
        })
      }

      const notifications = await Notification.find({
        recipientEmail: user.email,
      })
        .sort({ createdAt: -1 })
        .lean()

      return res.status(200).json({
        success: true,
        notifications,
        unreadCount: notifications.filter(
          (notification) => !notification.isRead
        ).length,
      })
    } catch (error) {
      console.error('Notification API error:', error)

      return res.status(500).json({
        success: false,
        message: 'Unable to load notifications.',
      })
    }
  }
)

// PATCH /api/notifications/:id/read
// Mark a notification as read, but only for its recipient.
router.patch(
  '/:id/read',
  authMiddleware,
  requireRole('Citizen'),
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid notification ID.',
        })
      }

      const user = await User.findById(req.user.userId).select('email')

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Account not found. Please sign in again.',
        })
      }

      const notification = await Notification.findOneAndUpdate(
        {
          _id: req.params.id,
          recipientEmail: user.email,
        },
        {
          $set: { isRead: true },
        },
        {
          new: true,
        }
      ).lean()

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found.',
        })
      }

      return res.status(200).json({
        success: true,
        message: 'Notification marked as read.',
        notification,
      })
    } catch (error) {
      console.error('Notification API error:', error)

      return res.status(500).json({
        success: false,
        message: 'Unable to update the notification.',
      })
    }
  }
)

module.exports = router
