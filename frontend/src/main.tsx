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

// A NEW DEPLOY SHOWS UP WITHOUT CLEARING ANYTHING (the owner, 2026-09-17: "it
// didnt change" — his tab was a build behind, served by the offline cache).
// The service worker installs a new build in the background and, with
// skipWaiting + clientsClaim, takes over the open page; nothing then reloaded
// the page, so it kept running the old bundle. When a NEW worker takes over a
// page an OLD one controlled, reload once. The first install (no worker before)
// does not reload, and the flag stops a second reload in the same page. An open
// tab also asks for an update every half hour.
if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller)
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    window.location.reload()
  })
  const check = () => { void navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {}) }
  window.addEventListener('load', check)
  window.setInterval(check, 30 * 60_000)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
