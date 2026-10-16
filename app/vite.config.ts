import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The page builds into ../web, which server.py serves; `yarn dev` serves it here with the API proxied to the backend.
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: { outDir: '../web', emptyOutDir: true },
  server: { port: 5181, proxy: { '/api': 'http://127.0.0.1:' + (process.env.PORT || '8765') } },
})
