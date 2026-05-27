import { Router, Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.js";
import { UserService } from "../services/user-service.js";
import { blacklistToken } from "../cache/token-blacklist.js";

export function createAuthRoutes(userServiceInstance: UserService): Router {
  const router = Router();

  // POST /auth/login — authenticate user (no auth required)
  router.post("/login", async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "email and password are required",
      });
      return;
    }

    const result = await userServiceInstance.authenticateUser({
      email,
      password,
    });

    if (!result.success) {
      res
        .status(401)
        .json({ error: "AUTHENTICATION_FAILED", message: result.error });
      return;
    }

    res.status(200).json({ token: result.token, user: result.user });
  });

  // POST /auth/register — create a reporter account (in-memory stage)
  router.post(
    "/register",
    async (req: Request, res: Response): Promise<void> => {
      const { email, password, name, department } = req.body;

      if (!email || !password || !name || !department) {
        res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "email, password, name and department are required",
        });
        return;
      }

      const result = await userServiceInstance.registerUser({
        email,
        password,
        name,
        department,
      });

      if (!result.success) {
        res
          .status(400)
          .json({ error: "REGISTRATION_FAILED", message: result.error });
        return;
      }

      res.status(201).json({ token: result.token, user: result.user });
    },
  );

  // POST /auth/refresh — refresh token (authenticated)
  router.post("/refresh", (req: AuthenticatedRequest, res: Response): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
        message: "Invalid or expired token",
      });
      return;
    }

    const token = authHeader.slice(7);
    const newToken = userServiceInstance.refreshToken(token);

    if (!newToken) {
      res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
        message: "Invalid or expired token",
      });
      return;
    }

    res.status(200).json({ token: newToken });
  });

  // POST /auth/logout — invalidate the current Bearer token (no auth middleware)
  // Validates the token internally so callers can log out even when the token
  // is technically still valid. Falls back gracefully when Redis is unavailable.
  router.post("/logout", async (req: Request, res: Response): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
        message: "Invalid or expired token",
      });
      return;
    }

    const token = authHeader.slice(7);
    const result = userServiceInstance.validateToken(token);

    if (!result.valid || !result.payload) {
      res.status(401).json({
        error: "AUTHENTICATION_REQUIRED",
        message: "Invalid or expired token",
      });
      return;
    }

    const { jti, exp } = result.payload as { jti?: string; exp?: number };

    // Legacy tokens issued before the jti claim was added — nothing to blacklist.
    if (!jti || typeof exp !== "number") {
      res.status(200).json({ message: "Logged out" });
      return;
    }

    const ttlSeconds = exp - Math.floor(Date.now() / 1000);
    // blacklistToken is a no-op for ttlSeconds <= 0 and swallows Redis errors.
    await blacklistToken(jti, ttlSeconds);

    res.status(200).json({ message: "Logged out" });
  });

  return router;
}
