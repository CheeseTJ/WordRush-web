import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import './styles-mobile.css'
import './styles-tablet.css'
import './styles-desktop.css'
import './styles-books.css'
// 官方课程：含页级布局（纸面背景/间距），必须排在 styles.css 之后
// 才能覆盖 .view 的 flex:1，因此与其他布局文件一起在入口导入
import './styles-courses.css'
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
