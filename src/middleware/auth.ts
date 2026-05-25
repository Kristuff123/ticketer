import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../models/enums';
import { userService } from '../services/user-service';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: UserRole;
  };
}

export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Invalid or expired token',
    });
    return;
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  const result = userService.validateToken(token);

  if (!result.valid || !result.payload) {
    res.status(401).json({
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Invalid or expired token',
    });
    return;
  }

  req.user = {
    userId: result.payload.userId,
    email: result.payload.email,
    role: result.payload.role,
  };

  next();
}
