import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // GitHub supplies the Pages path during deployment; local development uses /.
  base: process.env.VITE_BASE_PATH || '/',
})
