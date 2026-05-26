import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/permissions.js';
import { UserRole } from '../models/enums.js';
import { UserService } from '../services/user-service.js';

export function createUserRoutes(userService: UserService): Router {
  const router = Router();

  router.get(
    '/',
    requireRole(UserRole.ADMIN),
    async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
      const users = await userService.listUsers();
      res.status(200).json({ users });
    }
  );

  router.get(
    '/assignable',
    requireRole(UserRole.ADMIN),
    async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
      const users = await userService.getAssignableUsers();
      res.status(200).json({ users });
    }
  );

  router.post(
    '/',
    requireRole(UserRole.ADMIN),
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const { email, password, name, department, role } = req.body;

      if (!email || !password || !name || !department || !role) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'email, password, name, department and role are required',
        });
        return;
      }

      if (!Object.values(UserRole).includes(role)) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid role' });
        return;
      }

      const result = await userService.createUser({
        email,
        password,
        name,
        department,
        role,
      });

      if (!result.success) {
        res.status(400).json({ error: 'USER_CREATE_FAILED', message: result.error });
        return;
      }

      res.status(201).json(result.user);
    }
  );

  router.patch(
    '/:userId',
    requireRole(UserRole.ADMIN),
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const userId = req.params.userId as string;
      const { name, department, role, isActive } = req.body;

      if (userId === req.user!.userId && (role !== undefined || isActive === false)) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'You cannot change your own role or deactivate your own account.',
        });
        return;
      }

      if (role !== undefined && !Object.values(UserRole).includes(role)) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid role' });
        return;
      }

      const result = await userService.updateUser(userId, {
        name,
        department,
        role,
        isActive,
      });

      if (!result.success) {
        res.status(404).json({ error: 'USER_UPDATE_FAILED', message: result.error });
        return;
      }

      res.status(200).json(result.user);
    }
  );

  return router;
}
