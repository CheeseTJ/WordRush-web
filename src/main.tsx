import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import './styles-mobile.css'
import './styles-tablet.css'
import './styles-desktop.css'
import './styles-books.css'
import { registerSW } from 'virtual:pwa-register'

// SW 自动更新：新版本后台下载，下次刷新生效
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
