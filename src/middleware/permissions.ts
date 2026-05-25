import { Response, NextFunction } from 'express';
import { UserRole } from '../models/enums';
import { userService } from '../services/user-service';
import { AuthenticatedRequest } from './auth';

/**
 * Factory function that returns middleware to check if the authenticated user
 * has permission to perform the given operation on the target ticket.
 */
export function requirePermission(operation: string) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Invalid or expired token',
      });
      return;
    }

    const ticketId = req.params.ticketId as string | undefined;

    const hasPermission = await userService.hasPermission(
      user.userId,
      operation,
      ticketId
    );

    if (!hasPermission) {
      const requiredRole = getRequiredRoleForOperation(operation);
      res.status(403).json({
        error: 'PERMISSION_DENIED',
        message: 'Insufficient permissions',
        requiredRole,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware that checks if the authenticated user's role is in the allowed list.
 */
export function requireRole(...roles: UserRole[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Invalid or expired token',
      });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({
        error: 'PERMISSION_DENIED',
        message: 'Insufficient permissions',
        requiredRole: roles.join(', '),
      });
      return;
    }

    next();
  };
}

/**
 * Maps an operation to the minimum required role for informational purposes.
 */
function getRequiredRoleForOperation(operation: string): string {
  switch (operation) {
    case 'view':
      return UserRole.REPORTER;
    case 'close':
      return UserRole.REPORTER;
    case 'add_comment':
      return UserRole.REPORTER;
    case 'add_internal_comment':
      return UserRole.TECHNICIAN;
    case 'change_status':
      return UserRole.TECHNICIAN;
    case 'assign':
      return UserRole.ADMIN;
    default:
      return UserRole.ADMIN;
  }
}
