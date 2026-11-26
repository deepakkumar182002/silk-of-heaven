import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** robots.txt with the sitemap served by the API (it lists every product and page). */
const robots = (apiUrl) => ({
  name: 'vell-robots',
  generateBundle() {
    const api = (apiUrl || 'http://localhost:5050').replace(/\/$/, '');
    this.emitFile({
      type: 'asset',
      fileName: 'robots.txt',
      source: `User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /reset-password\n\nSitemap: ${api}/api/public/sitemap.xml\n`,
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return { plugins: [react(), robots(env.VITE_API_URL)] };
});
