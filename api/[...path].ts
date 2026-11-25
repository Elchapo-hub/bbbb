import express, { type NextFunction, type Request, type Response } from 'express';
import { getDb } from '../src/server/db';
import { createApiRouter } from '../src/server/routes';

// Vercel maps this catch-all function to /api/*. Keeping the API under the
// same origin lets the browser continue to use relative /api/v1 requests.
const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use('/api/v1', createApiRouter(getDb()));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'SMG Corelink API', timestamp: new Date().toISOString() });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled API error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
