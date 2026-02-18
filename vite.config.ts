import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss()
  ],
  server: {
    proxy: {
      '/api/ws': {
        target: 'ws://127.0.0.1:9000',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ws/, '/ws')
      },
      '/api': {
        target: 'http://127.0.0.1:9000/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
    }
  }
})
