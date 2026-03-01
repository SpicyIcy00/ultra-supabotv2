import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'BI Dashboard',
        short_name: 'BI Dash',
        description: 'Business Intelligence Dashboard for retail analytics',
        theme_color: '#0e1117',
        background_color: '#0e1117',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192x192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/pwa-192x192.svg', sizes: '512x512', type: 'image/svg+xml' },
          { src: '/pwa-192x192.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 3600 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-query': ['@tanstack/react-query', 'zustand'],
          'vendor-date': ['date-fns'],
        },
      },
    },
  },
})
