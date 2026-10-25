
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all IP addresses (including 192.168.1.3 for phone access)
    port: 5176,
    strictPort: true,
  },
})
