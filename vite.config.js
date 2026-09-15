import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        cadastro: resolve(__dirname, 'cadastro.html'),
        convite: resolve(__dirname, 'convite.html'),
        entrar: resolve(__dirname, 'entrar.html'),
        perfil: resolve(__dirname, 'perfil.html'),
        ranking: resolve(__dirname, 'ranking.html'),
      },
    },
  },
})

