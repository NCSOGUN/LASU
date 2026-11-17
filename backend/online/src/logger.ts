import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.refresh_token',
      '*.code',
      '*.phone',
      '*.content',
    ],
    censor: '[redacted]',
  },
});
