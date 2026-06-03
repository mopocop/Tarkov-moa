import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // Client tests only; the relay (server/) has its own vitest project.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
