import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        admin: 'admin.html',
        cadastro: 'cadastro.html',
        convite: 'convite.html',
        entrar: 'entrar.html',
        perfil: 'perfil.html',
        ranking: 'ranking.html',
      },
    },
  },
})


