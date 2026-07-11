import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // No manual mapbox chunk: a *named* manual chunk is treated as an eager
  // shared chunk, which let Rolldown co-locate Vite's preload helper there and
  // made the landing entry statically import (and eagerly fetch) all ~1.8MB of
  // Mapbox. Reached only through the lazy `App` import, Mapbox becomes a pure
  // async chunk that loads only when a visitor enters /app.
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Rollaway',
        short_name: 'Rollaway',
        description:
          'Map-first spot recommendations and permit guidance for San Francisco mobile food vendors.',
        theme_color: '#C2410C',
        background_color: '#FFF7ED',
        display: 'standalone',
        orientation: 'portrait',
        // Launch installed app straight into the map app; keep the whole
        // origin (incl. the marketing landing at /) in scope.
        start_url: '/app',
        scope: '/',
        id: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // mapbox-gl alone is ~1.6MB minified; still worth precaching for offline shell
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,json,geojson,woff2}'],
        runtimeCaching: [
          {
            // Mapbox tiles + styles: best-effort cache so revisits are fast
            urlPattern: /^https:\/\/(api|events)\.mapbox\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mapbox-cache',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
