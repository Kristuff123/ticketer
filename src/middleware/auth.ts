import { Request, Response, NextFunction } from "express";
import { UserRole } from "../models/enums.js";
import { userService } from "../services/user-service.js";
import { isBlacklisted } from "../cache/token-blacklist.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: UserRole;
  };
}

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "AUTHENTICATION_REQUIRED",
      message: "Invalid or expired token",
    });
    return;
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  const result = userService.validateToken(token);

  if (!result.valid || !result.payload) {
    res.status(401).json({
      error: "AUTHENTICATION_REQUIRED",
      message: "Invalid or expired token",
    });
    return;
  }

  // Check blacklist if jti is present. Tokens issued before the jti claim
  // was added cannot be blacklisted, so legacy tokens skip this check.
  // isBlacklisted swallows Redis errors and returns false, allowing the
  // request to proceed (Req 11.5). Defensive try/catch in case that contract
  // is ever broken.
  const jti = result.payload?.jti;
  if (jti) {
    try {
      const blacklisted = await isBlacklisted(jti);
      if (blacklisted) {
        res.status(401).json({
          error: "AUTHENTICATION_REQUIRED",
          message: "Invalid or expired token",
        });
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `Token blacklist check failed; allowing request to proceed: ${message}`,
      );
    }
  }

  req.user = {
    userId: result.payload.userId,
    email: result.payload.email,
    role: result.payload.role,
  };

  next();
}
