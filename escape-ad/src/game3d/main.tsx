import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Game3D } from './Game3D'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Game3D />
  </StrictMode>,
)
