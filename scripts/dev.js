// Unified dev entry: starts the Lucio API (port 8787) and the Vite dev server in one process.
// Usage: npm run dev -- --port 7100 --host    (extra args are forwarded to Vite)
import { createServer as createViteServer } from 'vite';
import { createApp } from '../server/index.js';

const PORT = Number(process.env.LUCIO_API_PORT || 8787);
createApp().listen(PORT, () => console.log(`[lucio-api] http://localhost:${PORT}`));

const viteArgs = process.argv.slice(2);
const argValue = (name, dflt) => {
  const i = viteArgs.indexOf(`--${name}`);
  return i > -1 ? viteArgs[i + 1] : dflt;
};

const vite = await createViteServer({
  configFile: undefined,
  root: process.cwd(),
  server: {
    port: Number(argValue('port', 3000)),
    host: viteArgs.includes('--host') ? true : argValue('host', undefined),
    strictPort: false,
    proxy: {
      '/api': { target: `http://localhost:${PORT}`, changeOrigin: true },
      '/live': { target: `http://localhost:${PORT}`, changeOrigin: true },
      '/portal': { target: `http://localhost:${PORT}`, changeOrigin: true },
      // Public client-facing pages served by the API (publicRouter) — without
      // these, Vite's SPA fallback swallows them and clients see the app shell
      // instead of the actual site/review content.
      '/tpl': { target: `http://localhost:${PORT}`, changeOrigin: true },
      '/review': { target: `http://localhost:${PORT}`, changeOrigin: true },
    },
  },
  clearScreen: false,
});
await vite.listen();
const addr = vite.httpServer?.address();
const port = typeof addr === 'object' && addr ? addr.port : argValue('port', 3000);
console.log(`[lucio-web] http://localhost:${port} (api proxied from /api -> :${PORT})`);
