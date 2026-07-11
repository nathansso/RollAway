import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Tests assume deterministic fixtures. Pin fixture mode so a live `.env.local`
    // (VITE_USE_FIXTURES=false) never leaks in and makes "without fetch" tests
    // hit the network.
    env: {
      VITE_USE_FIXTURES: 'true',
    },
  },
})
