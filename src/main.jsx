import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import Write from './Write.jsx'
import { startSync } from './lib/sync.js'

startSync()

// The service worker caches the app itself so it opens with no connection.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Write />
  </StrictMode>,
)
