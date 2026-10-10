import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from '@/state/store'
import Login from '@/pages/Login'
import Home from '@/pages/Home'
import Map from '@/pages/Map'
import Quiz from '@/pages/Quiz'
import Review from '@/pages/Review'
import Stats from '@/pages/Stats'
import Me from '@/pages/Me'

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
        <Route path="stats" element={<Stats />} />
        <Route path="me" element={<Me />} />
        <Route path="quiz/:unitId" element={<Quiz />} />
      </Route>
      <Route path="*" element={<Navigate to="/map" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
