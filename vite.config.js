import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'

// Versión que se ve al pie de la app: «v 5.3». El primer número está en version.json y se sube
// a mano con cada cambio grande; el segundo cuenta los commits hechos después de esa subida, así
// que suma 1 solo con cada corrección publicada. En local se agrega «· local».
function versionApp() {
  const { mayor } = JSON.parse(readFileSync(new URL('./version.json', import.meta.url), 'utf8'))
  const git = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  let menor = null
  try {
    const base = git('git log -1 --format=%H -- version.json')
    menor = base ? Number(git(`git rev-list --count ${base}..HEAD`)) : 0
  } catch {
    // sin git: se muestra solo el número grande
  }
  const local = process.env.GITHUB_ACTIONS ? '' : ' · local'
  return `v ${mayor}${menor === null ? '' : `.${menor}`}${local}`
}

// Solo en la versión publicada: política de seguridad de contenido (CSP). El navegador solo
// ejecuta código de la propia app y solo se conecta con Supabase. En desarrollo no se aplica
// porque la recarga en vivo de Vite usa scripts en línea.
function seguridadYApp(supabaseUrl) {
  const supa = new URL(supabaseUrl)
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supa.origin}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supa.origin} wss://${supa.host}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ')
  return {
    name: 'rvc-seguridad-y-app',
    apply: 'build',
    transformIndexHtml(html) {
      // Justo después del charset (que debe ir primero en <head>).
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`,
      )
    },
  }
}

// https://vite.dev/config/
// base relativa: funciona en GitHub Pages (https://<usuario>.github.io/<repo>/) y en local.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseUrl = env.VITE_SUPABASE_URL || 'https://example.supabase.co'
  return {
    base: './',
    plugins: [react(), seguridadYApp(supabaseUrl)],
    define: { __VERSION_APP__: JSON.stringify(versionApp()) },
  }
})
