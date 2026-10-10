import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { VitePWA } from 'vite-plugin-pwa'

// 前端路由一律 history 模式（URL 不带 #），由后端 SPA 回退兜底。
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'WordRush · 单词闯关',
        short_name: 'WordRush',
        description: '柔体粘土风的英语单词闯关应用',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#58CC02',
        background_color: '#FFF6EA',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // SPA 入口与静态资源走 precache，离线可打开
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        runtimeCaching: [
          {
            // 词库正文：CacheFirst——首次联网加载后永久离线可用
            urlPattern: ({ url }) => url.pathname.startsWith('/books/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'wordrush-books',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 情景剧本（迭代四）：CacheFirst，与词库同策略离线可玩
            urlPattern: ({ url }) => url.pathname.startsWith('/stories/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'wordrush-stories',
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 业务 API：网络优先，失败回退缓存——离线时进度可读
            urlPattern: ({ url }) => url.pathname.startsWith('/api/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'wordrush-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    // 开发期把 /api 转发到本机 wordrush-api
    proxy: {
      '/api': {
        target: 'http://localhost:8092',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2020',
  },
})
