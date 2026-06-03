import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './vendor/fontawesome/css/all.min.css'
import './squad/squad.css'
import App from './App.tsx'
import { SquadProvider } from './squad/SquadContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SquadProvider>
      <App />
    </SquadProvider>
  </StrictMode>,
)
