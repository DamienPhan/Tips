import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './index.css'

// Enregistrement explicite plutôt que l'injection auto par défaut de vite-plugin-pwa : avec
// registerType 'autoUpdate', l'injection auto bascule le service worker en silence sur un onglet
// déjà ouvert SANS recharger la page, qui continue de référencer les anciens chunks hashés
// (jspdf/xlsx notamment, importés dynamiquement) — ceux-ci n'existent plus après un déploiement,
// d'où "Importing a module script failed" au clic sur un export. `updateSW(true)` force un
// rechargement dès qu'une nouvelle version est détectée pour éviter qu'un onglet reste bloqué
// sur une version obsolète.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() { updateSW(true) }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
