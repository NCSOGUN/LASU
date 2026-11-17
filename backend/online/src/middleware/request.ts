import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export const requestContext: RequestHandler = (req, res, next) => {
  const header = req.headers['x-request-id'];
  const id = typeof header === 'string' && header.length > 0 ? header.slice(0, 128) : randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
};
