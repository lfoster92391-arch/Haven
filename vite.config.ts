import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'favicon.ico'],
      manifest: {
        id: 'https://hellohaven.org/',
        name: 'Haven — Life Operating System',
        short_name: 'Haven',
        description: 'Reduce the invisible mental load of everyday life.',
        theme_color: '#4a6741',
        background_color: '#faf8f4',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'logo.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Keep install light — large hero/auth photos load on demand, not at SW install.
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        globIgnores: [
          '**/assets/living-heart/banner-*.png',
          '**/assets/living-heart/banner-*.webp',
          '**/assets/welcome/auth-bg.*',
        ],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\/assets\/(living-heart|welcome)\/.+\.(webp|png)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'haven-hero-images',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
})
