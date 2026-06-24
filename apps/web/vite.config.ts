import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const tauriApiStub = fileURLToPath(new URL('./src/tauri-api-stub.ts', import.meta.url))
const tauriUpdaterStub = fileURLToPath(new URL('./src/tauri-updater-stub.ts', import.meta.url))
const tauriProcessStub = fileURLToPath(new URL('./src/tauri-process-stub.ts', import.meta.url))
const tauriEventStub = fileURLToPath(new URL('./src/tauri-event-stub.ts', import.meta.url))
const tauriDeepLinkStub = fileURLToPath(new URL('./src/tauri-deep-link-stub.ts', import.meta.url))

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  define: {
    'import.meta.env.VITE_LOCKPASS_USER_WEB_APP': JSON.stringify('1')
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../desktop/src', import.meta.url)),
      '@tauri-apps/api/core': tauriApiStub,
      '@tauri-apps/api/event': tauriEventStub,
      '@tauri-apps/plugin-updater': tauriUpdaterStub,
      '@tauri-apps/plugin-process': tauriProcessStub,
      '@tauri-apps/plugin-deep-link': tauriDeepLinkStub
    }
  },
  server: {
    host: '127.0.0.1',
    port: 1431,
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
