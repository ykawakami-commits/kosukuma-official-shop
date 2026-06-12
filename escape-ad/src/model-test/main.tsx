import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ModelTestApp } from './ModelTestApp'
import './model-test.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ModelTestApp />
  </StrictMode>,
)
