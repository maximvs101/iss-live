import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HomeApp } from './HomeApp.tsx'
import './home.css'

const root = document.getElementById('home-app')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <HomeApp />
    </StrictMode>,
  )
}
