import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      injectRegister: null, // Disable automatic injection to prevent console errors in extension
      registerType: 'autoUpdate',
      includeAssets: ['icon128.png', 'favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Page Writer',
        short_name: 'Writer',
        description: 'Real-time Markdown Editor for Multi-device',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'icon128.png',
            sizes: '128x128',
            type: 'image/png'
          },
          {
            src: 'icon128.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
