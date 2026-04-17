import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      injectRegister: false,
      registerType: 'autoUpdate',
      includeAssets: ['icon128.png'],
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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'firebase';
            if (id.includes('@tiptap')) return 'tiptap';
            return 'vendor';
          }
        }
      }
    }
  }
})
