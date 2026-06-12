import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// 単体プレビュー用の最小構成。base は相対パスにして
// Vercel/サブパスどちらでも資産が解決できるようにする。
// マルチページ：ゲーム本体(index) と 3D検証(model-test)。
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        modelTest: resolve(__dirname, 'model-test.html'),
        game3d: resolve(__dirname, 'game3d.html'),
      },
    },
  },
})
