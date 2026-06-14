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
import { setupI18n } from './i18n'

// Resolve the language (user choice → EFT game language → system → English)
// and init i18next before first render so the UI never flashes the wrong locale.
void setupI18n().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <SquadProvider>
        <App />
      </SquadProvider>
    </StrictMode>,
  )
})
