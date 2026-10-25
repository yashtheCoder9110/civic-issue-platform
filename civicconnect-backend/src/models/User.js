
const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: function () {
        return this.authProvider === 'local'
      },
      select: false,
    },
    role: {
      type: String,
      enum: ['Citizen', 'Officer'],
      default: 'Citizen',
      required: true,
    },
    authProvider: {
      type: String,
      enum: ['local', 'google', 'guest'],
      default: 'local',
    },
    isGuest: {
      type: Boolean,
      default: false,
    },
    googleId: {
      type: String,
      sparse: true,
    },
    avatar: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

module.exports = mongoose.model('User', userSchema, 'users')
