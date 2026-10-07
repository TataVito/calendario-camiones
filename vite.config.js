import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// base relativa: funciona en GitHub Pages (https://<usuario>.github.io/<repo>/) y en local.
export default defineConfig({
  base: './',
  plugins: [react()],
})
