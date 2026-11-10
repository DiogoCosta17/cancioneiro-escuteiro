import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo.png', 'hero-bg.jpg', 'icon-192x192.png', 'icon-512x512.png'],
      manifest: {
        name: 'Cancioneiro 488-Mafra',
        short_name: 'Cancioneiro 488',
        description: 'Cancioneiro do Agrupamento 488 de Mafra',
        theme_color: '#2d5016',
        background_color: '#18181b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff2}'],
        // A API do Supabase não passa pela cache do service worker: numa rede lenta devolvia respostas
        // antigas como se fossem frescas. Os dados offline vivem no IndexedDB (src/lib/offline-storage.ts).
        runtimeCaching: [
          {
            // Só imagens da própria origem (nada de respostas opacas de terceiros)
            urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
              sameOrigin && /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'images-assets-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
              },
              cacheableResponse: {
                statuses: [200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (normalized.includes('node_modules')) {
            if (
              normalized.includes('/react/') ||
              normalized.includes('/react-dom/') ||
              normalized.includes('/react-router/') ||
              normalized.includes('/react-router-dom/') ||
              normalized.includes('/@remix-run/')
            ) {
              return 'vendor-react';
            }
            if (normalized.includes('/@supabase/')) {
              return 'vendor-supabase';
            }
            if (normalized.includes('/lucide-react/')) {
              return 'vendor-icons';
            }
          }
        },
      },
    },
  },
});
