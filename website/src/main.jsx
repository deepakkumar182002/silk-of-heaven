import { createRoot } from 'react-dom/client';
import { loadCatalog } from './data.js';
import './styles.css';
import './responsive.css';
import './shop.css';
import './store.css';
import './fitting.css';

const root = createRoot(document.getElementById('root'));

// Load the live catalog first, then import App (it preloads look images at module load).
loadCatalog().then(async () => {
  const { default: App } = await import('./App.jsx');
  root.render(<App />);
});
