import { Router, Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { UserService } from '../services/user-service.js';

export function createAuthRoutes(userServiceInstance: UserService): Router {
  const router = Router();

  // POST /auth/login — authenticate user (no auth required)
  router.post(
    '/login',
    async (req: Request, res: Response): Promise<void> => {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'email and password are required' });
        return;
      }

      const result = await userServiceInstance.authenticateUser({ email, password });

      if (!result.success) {
        res.status(401).json({ error: 'AUTHENTICATION_FAILED', message: result.error });
        return;
      }

      res.status(200).json({ token: result.token, user: result.user });
    }
  );

  // POST /auth/refresh — refresh token (authenticated)
  router.post(
    '/refresh',
    (req: AuthenticatedRequest, res: Response): void => {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'AUTHENTICATION_REQUIRED', message: 'Invalid or expired token' });
        return;
      }

      const token = authHeader.slice(7);
      const newToken = userServiceInstance.refreshToken(token);

      if (!newToken) {
        res.status(401).json({ error: 'AUTHENTICATION_REQUIRED', message: 'Invalid or expired token' });
        return;
      }

      res.status(200).json({ token: newToken });
    }
  );

  return router;
}
