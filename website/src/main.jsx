import { createRoot } from 'react-dom/client';
import { loadCatalog } from './data.js';
import './styles.css';
import './responsive.css';
import './shop.css';
import './store.css';
import './fitting.css';
import './account.css';
import './promo.css';

const root = createRoot(document.getElementById('root'));

// Load the live catalog first, then import App (it preloads look images at module load).
loadCatalog().then(async () => {
  const [{ default: App }, { AccountProvider }] = await Promise.all([import('./App.jsx'), import('./account/account.jsx')]);
  root.render(
    <AccountProvider>
      <App />
    </AccountProvider>
  );
});
