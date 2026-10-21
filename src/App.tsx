import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from '@/state/store'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import Login from '@/pages/Login'
import Home from '@/pages/Home'
import Map from '@/pages/Map'
import Quiz from '@/pages/Quiz'
import Review from '@/pages/Review'
import Me from '@/pages/Me'
import Story from '@/pages/Story'
import Scenarios from '@/pages/Scenarios'
import ScenarioChat from '@/pages/ScenarioChat'
import Courses from '@/pages/Courses'

function Gate({ children }: { children: React.ReactNode }) {
  const { authed } = useApp()
  const loc = useLocation()
  if (!authed) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  return <>{children}</>
}

function Shell() {
  const { authed } = useApp()
  return (
    <Routes>
      <Route
        path="/login"
        element={authed ? <Navigate to="/map" replace /> : <Login />}
      />
      <Route
        path="/"
        element={
          <Gate>
            <Home />
          </Gate>
        }
      >
        <Route index element={<Navigate to="/map" replace />} />
        <Route path="map" element={<Map />} />
        <Route path="review" element={<Review />} />
        <Route path="chat" element={<Navigate to="/scenarios" replace />} />
        <Route path="scenarios" element={<Scenarios />} />
        <Route path="chat/:sid" element={<ScenarioChat />} />
        <Route path="courses" element={<Courses />} />
        {/* 统计已合并进「我的」：保留旧地址重定向，避免书签与 PWA 快捷方式失效 */}
        <Route path="stats" element={<Navigate to="/me" replace />} />
        <Route path="me" element={<Me />} />
        <Route path="quiz/:unitId" element={<Quiz />} />
        <Route path="story/:chapterId" element={<Story />} />
      </Route>
      <Route path="*" element={<Navigate to="/map" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ErrorBoundary>
  )
}
