import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { getDb } from './src/server/db';
import { createApiRouter } from './src/server/routes';

export async function startServer() {
  const app = express();
  const port = Number(process.env.PORT || 3000);
  const db = getDb();

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));

  // Mount versioned REST API
  app.use('/api/v1', createApiRouter(db));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'SMG Corelink API', timestamp: new Date().toISOString() });
  });

  const distDir = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

  if (isProd) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`SMG Corelink server running on http://0.0.0.0:${port}`);
  });
}

// Start server only when executed directly as entrypoint
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('server.ts')) {
  startServer().catch((err) => {
    console.error('Failed to start SMG Corelink server:', err);
    process.exit(1);
  });
}
