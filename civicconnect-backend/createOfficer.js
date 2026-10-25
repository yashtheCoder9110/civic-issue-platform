const dns = require('dns');
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (e) {}

require('dotenv').config()

const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const readline = require('readline')
const User = require('./src/models/User')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()))
  })
}

async function main() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is missing from the backend .env file.')
    }

    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB.')

    const name = await ask('Officer full name: ')
    const email = (await ask('Officer email: ')).toLowerCase()

    if (!name || !email || !email.includes('@')) {
      throw new Error('Please enter a valid name and email.')
    }

    const existingUser = await User.findOne({ email })

    if (existingUser) {
      throw new Error(
        'This email already has an account. Choose another email.'
      )
    }

    const password = await ask(
      'Officer password (minimum 8 characters): '
    )

    if (password.length < 8) {
      throw new Error('The password must contain at least 8 characters.')
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'Officer',
    })

    console.log('Officer account created successfully.')
    console.log(`Officer email: ${email}`)
  } catch (error) {
    console.error('Could not create Officer account:', error.message)
    process.exitCode = 1
  } finally {
    await mongoose.disconnect().catch(() => {})
    rl.close()
  }
}

main()
