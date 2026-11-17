import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { startReminderJob } from './jobs/reminders.js';
import { logger } from './logger.js';

const app = createApp();
const server = createServer(app);
const reminderJob = startReminderJob();

server.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'healthaccess online listening');
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  reminderJob.stop();
  server.close();
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
