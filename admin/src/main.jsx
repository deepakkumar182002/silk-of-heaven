import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import { Spinner, ToastProvider } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Looks from './pages/Looks.jsx';
import Styling from './pages/Styling.jsx';
import Settings from './pages/Settings.jsx';
import { Categories, Characters, Filters } from './pages/Resources.jsx';
import Orders from './pages/Orders.jsx';
import Team from './pages/Team.jsx';
import './styles.css';
import './orders.css';
import './ai.css';

function Guard({ children }) {
  const { admin, ready } = useAuth();
  if (!ready)
    return (
      <div className="boot">
        <Spinner size={28} />
      </div>
    );
  return admin ? children : <Navigate to="/login" replace />;
}

// Tailors only get Dashboard + Orders; everything else bounces to the dashboard
function AdminOnly({ children }) {
  const { admin } = useAuth();
  return admin?.role === 'admin' ? children : <Navigate to="/" replace />;
}

function LoginRoute() {
  const { admin, ready } = useAuth();
  if (ready && admin) return <Navigate to="/" replace />;
  return <Login />;
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route
            element={
              <Guard>
                <Layout />
              </Guard>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<Orders />} />
            <Route path="team" element={<AdminOnly><Team /></AdminOnly>} />
            <Route path="looks" element={<AdminOnly><Looks /></AdminOnly>} />
            <Route path="characters" element={<AdminOnly><Characters /></AdminOnly>} />
            <Route path="categories" element={<AdminOnly><Categories /></AdminOnly>} />
            <Route path="styling" element={<AdminOnly><Styling /></AdminOnly>} />
            <Route path="filters" element={<AdminOnly><Filters /></AdminOnly>} />
            <Route path="settings" element={<AdminOnly><Settings /></AdminOnly>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ToastProvider>
  </BrowserRouter>
);
