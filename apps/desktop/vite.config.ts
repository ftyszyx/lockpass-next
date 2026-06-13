import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '127.0.0.1',
    port: 1430,
    strictPort: true,
    proxy: {
      '/__lockpass_sync_api': {
        target: 'http://127.0.0.1:1480',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__lockpass_sync_api/, '')
      }
    }
  },
  clearScreen: false
})
