import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger.js';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'error',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: 'not_found', request_id: req.requestId });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'validation_error',
      request_id: req.requestId,
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      request_id: req.requestId,
      details: error.details,
    });
    return;
  }
  logger.error({ err: error, request_id: req.requestId }, 'unhandled request error');
  res.status(500).json({ error: 'internal_error', request_id: req.requestId });
};
