
import { apiRequest } from './services/api.js'

async function testBackendConnection() {
  try {
    const data = await apiRequest('/api/health')
    console.log('Backend connection successful:', data)
  } catch (error) {
    console.error('Backend connection failed:', error.message)
  }
}

testBackendConnection()
