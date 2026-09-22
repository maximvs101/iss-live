import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PassesApp } from './PassesApp.tsx'
import './passes.css'

const root = document.getElementById('passes-app')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <PassesApp />
    </StrictMode>,
  )
}
