import { createServer } from 'vite';
import { startServer } from './server/http.js';

const apiPort = Number(process.env.API_PORT || 3001);
const webPort = Number(process.env.WEB_PORT || 5173);
const api = startServer(apiPort);
const vite = await createServer({
  server: { host: '127.0.0.1', port: webPort, strictPort: true, proxy: { '/api': `http://127.0.0.1:${apiPort}` } }
});
await vite.listen();
vite.printUrls();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await vite.close(); api.close(); });
