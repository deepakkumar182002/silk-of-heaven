import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import { Spinner, ToastProvider } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login, { ResetPassword } from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Looks from './pages/Looks.jsx';
import Items from './pages/Items.jsx';
import Bodies from './pages/Bodies.jsx';
import Styling from './pages/Styling.jsx';
import Settings from './pages/Settings.jsx';
import { Categories, Characters, Filters } from './pages/Resources.jsx';
import Orders from './pages/Orders.jsx';
import Reports from './pages/Reports.jsx';
import Customers from './pages/Customers.jsx';
import Coupons from './pages/Coupons.jsx';
import Promotions from './pages/Promotions.jsx';
import Notifications from './pages/Notifications.jsx';
import Reviews from './pages/Reviews.jsx';
import Team from './pages/Team.jsx';
import './styles.css';
import './orders.css';
import './ai.css';
import './library.css';
import './shopadmin.css';

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
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            element={
              <Guard>
                <Layout />
              </Guard>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<Orders />} />
            <Route path="reports" element={<AdminOnly><Reports /></AdminOnly>} />
            <Route path="customers" element={<AdminOnly><Customers /></AdminOnly>} />
            <Route path="coupons" element={<AdminOnly><Coupons /></AdminOnly>} />
            <Route path="promotions" element={<AdminOnly><Promotions /></AdminOnly>} />
            <Route path="notifications" element={<AdminOnly><Notifications /></AdminOnly>} />
            <Route path="reviews" element={<AdminOnly><Reviews /></AdminOnly>} />
            <Route path="team" element={<AdminOnly><Team /></AdminOnly>} />
            <Route path="looks" element={<AdminOnly><Looks /></AdminOnly>} />
            <Route path="items" element={<AdminOnly><Items /></AdminOnly>} />
            <Route path="bodies" element={<AdminOnly><Bodies /></AdminOnly>} />
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
