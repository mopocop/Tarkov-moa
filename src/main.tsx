import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import './ui/tokens.css'
import './index.css'
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
