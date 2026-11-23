import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { initSchema } from './server/db/database.ts';
import { seedDemoEnvironment } from './server/db/seed.ts';
import { adminRoutes } from './server/routes/adminRoutes.ts';
import { authRoutes } from './server/routes/authRoutes.ts';
import { mailRoutes } from './server/routes/mailRoutes.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

initSchema();
seedDemoEnvironment();

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'nexora' });
});

app.use('/api/auth', authRoutes);
app.use('/api', mailRoutes);
app.use('/api', adminRoutes);

app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err && typeof err === 'object' && 'code' in err && err.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: 'Le fichier dépasse la limite autorisée (taille maximale : 50 Mo).' });
    return;
  }
  const message = err instanceof Error ? err.message : 'Erreur interne du serveur';
  res.status(500).json({ error: message });
});

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build introuvable.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NEXORA server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
