import { createServer } from 'vite';
import { startServer } from './server/http.js';

startServer(3001);
const vite = await createServer({
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': 'http://127.0.0.1:3001' } }
});
await vite.listen();
vite.printUrls();
