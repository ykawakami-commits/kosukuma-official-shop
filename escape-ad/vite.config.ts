import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 単体プレビュー用の最小構成。base は相対パスにして
// Vercel/サブパスどちらでも資産が解決できるようにする。
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: true,
  },
})
