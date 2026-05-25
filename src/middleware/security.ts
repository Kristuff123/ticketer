import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { getAllowedCorsOrigins, isProduction } from '../config/env.js';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message: string;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const loginBuckets = new Map<string, RateLimitBucket>();

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.header('x-request-id');
  const id = incomingId || crypto.randomUUID();
  res.setHeader('X-Request-Id', id);
  req.headers['x-request-id'] = id;
  next();
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (isProduction()) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

export function cors(req: Request, res: Response, next: NextFunction): void {
  const allowedOrigins = getAllowedCorsOrigins();
  const origin = req.header('origin');

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Request-Id');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}

export function createRateLimiter(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${req.ip || req.socket.remoteAddress || 'unknown'}:${req.path}`;
    const bucket = loginBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      loginBuckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    bucket.count += 1;

    if (bucket.count > options.max) {
      res.status(429).json({
        error: 'RATE_LIMITED',
        message: options.message,
      });
      return;
    }

    next();
  };
}

export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again later.',
});

export function clearRateLimitBuckets(): void {
  loginBuckets.clear();
}
