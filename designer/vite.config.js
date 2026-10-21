import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApiHandler } from './server/api.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'le-api',
      configureServer(server) {
        const handle = createApiHandler({ designsDir: path.join(here, 'designs') });
        server.middlewares.use((req, res, next) => {
          handle(req, res).then((handled) => { if (!handled) next(); }).catch(next);
        });
      },
    },
  ],
  server: { port: 5173, host: true },
  build: { outDir: 'dist' },
});
