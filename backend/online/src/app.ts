import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { prisma } from './db.js';
import { logger } from './logger.js';
import { errorHandler, notFound } from './middleware/error.js';
import { requestContext } from './middleware/request.js';
import { router } from './routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: config.frontendUrl,
      credentials: true,
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));
  app.use(requestContext);
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      logger.info(
        {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration_ms: Date.now() - started,
          request_id: req.requestId,
        },
        'request',
      );
    });
    next();
  });

  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
  });

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/health/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`select 1`;
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.get('/docs', (_req, res) => {
    const file = fileURLToPath(new URL('../../../docs/api/index.html', import.meta.url));
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:3000 http://127.0.0.1:3000",
    );
    res.sendFile(file, (error) => {
      if (error) res.status(404).json({ error: 'docs_not_built' });
    });
  });

  app.use('/v1', router);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
