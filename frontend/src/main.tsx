import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installAuthInterceptors } from './services/httpAuth'

// Must run before any component fires a request, so every call carries the
// bearer token and a 401 reliably drops the session.
installAuthInterceptors()

// A deploy replaces every hashed chunk, so a tab still running the previous
// index.html can no longer fetch the lazy routes it was built against. Reload
// once to pick up the fresh build; the guard keeps a genuinely missing chunk
// from turning into a reload loop.
const RELOAD_KEY = 'chunk-reload-at'
window.addEventListener('vite:preloadError', (event) => {
  const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
  if (Date.now() - last < 15_000) return
  event.preventDefault()
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
