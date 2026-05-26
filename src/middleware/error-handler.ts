import { ErrorRequestHandler, Request, Response } from 'express';

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `No route found for ${req.method} ${req.path}`,
  });
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err?.status === 'number' ? err.status : 500;
  const message = status >= 500 ? 'Internal server error' : err.message;

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    error: status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
    message,
  });
};
