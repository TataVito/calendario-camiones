import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { defineConfig, loadEnv } from 'vite'

// Versión que se ve al pie de la app: fecha de publicación (hora de Chile) + commit.
// En GitHub Actions viene en GITHUB_SHA; en local se lee de git y se marca «local».
function versionApp() {
  const fecha = new Date().toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' })
  let commit = (process.env.GITHUB_SHA || '').slice(0, 7)
  if (!commit) {
    try {
      commit = execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + ' · local'
    } catch {
      commit = 'local'
    }
  }
  return `${fecha} · ${commit}`
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
