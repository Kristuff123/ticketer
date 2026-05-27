import "dotenv/config";
import express from "express";
import {
  assertPersistenceConfig,
  assertRuntimeConfig,
  getJsonBodyLimit,
  getPort,
} from "./config/env.js";
import { runMigrations } from "./database/migrate.js";
import { pingDatabase } from "./database/connection.js";
import { pingRedis } from "./cache/redis-client.js";
import { authenticate } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
import {
  cors,
  loginRateLimiter,
  requestId,
  securityHeaders,
} from "./middleware/security.js";
import { UserService, userService } from "./services/user-service.js";
import { TicketService } from "./services/ticket-service.js";
import { QueueService } from "./services/queue-service.js";
import {
  NotificationService,
  notificationService,
} from "./services/notification-service.js";
import { TicketRepository } from "./database/repositories/ticket-repository.js";
import { CommentRepository } from "./database/repositories/comment-repository.js";
import { TicketHistoryRepository } from "./database/repositories/ticket-history-repository.js";
import { createTicketRoutes } from "./routes/tickets.js";
import { createQueueRoutes } from "./routes/queue.js";
import { createNotificationRoutes } from "./routes/notifications.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createUserRoutes } from "./routes/users.js";

assertRuntimeConfig();

// Create Express app
const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(requestId);
app.use(cors);
app.use(securityHeaders);
app.use(express.json({ limit: getJsonBodyLimit() }));

// Wire services together
const ticketRepository = new TicketRepository();
const commentRepository = new CommentRepository();
const historyRepository = new TicketHistoryRepository();
const ticketService = new TicketService(
  ticketRepository,
  commentRepository,
  historyRepository,
  notificationService,
  userService,
);
const queueService = new QueueService(ticketRepository, historyRepository);

// Wire ticket lookup so UserService can check ticket ownership for permissions.
// Repositories are the source of truth — perform a real lookup against the
// TicketRepository. `findById` throws ValidationError on non-UUID input;
// the try/catch handles that gracefully.
userService["ticketLookup"] = async (ticketId: string) => {
  try {
    const t = await ticketRepository.findById(ticketId);
    if (!t) return null;
    return { reporterId: t.reporterId, assigneeId: t.assigneeId };
  } catch {
    return null;
  }
};

// Mount auth routes (no auth middleware required for /auth/login)
app.use("/auth/login", loginRateLimiter);
app.use("/auth", createAuthRoutes(userService));

app.get("/health", async (_req, res) => {
  // Run both connectivity checks in parallel with a 2-second timeout each (Req 12.7).
  const HEALTH_TIMEOUT_MS = 2000;

  const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), ms),
      ),
    ]);

  const [dbResult, cacheResult] = await Promise.allSettled([
    withTimeout(pingDatabase(), HEALTH_TIMEOUT_MS),
    withTimeout(pingRedis(), HEALTH_TIMEOUT_MS),
  ]);

  const db = dbResult.status === "fulfilled" ? "ok" : "error";
  const cache = cacheResult.status === "fulfilled" ? "ok" : "error";

  const allHealthy = db === "ok" && cache === "ok";
  const httpStatus = allHealthy ? 200 : 503;

  res.status(httpStatus).json({
    status: allHealthy ? "ok" : "degraded",
    db,
    cache,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Apply authenticate middleware to all routes below
app.use(authenticate);

// Mount protected routes
app.use("/tickets", createTicketRoutes(ticketService));
app.use("/queue", createQueueRoutes(queueService));
app.use("/notifications", createNotificationRoutes(notificationService));
app.use("/users", createUserRoutes(userService));

app.use(notFound);
app.use(errorHandler);

// Start server
const PORT = getPort();
let server: ReturnType<typeof app.listen> | undefined;

async function bootstrap(): Promise<void> {
  // Enforce production persistence config (Req 13.5) before any other startup work.
  assertPersistenceConfig();

  // Apply pending database migrations before the HTTP server begins accepting
  // requests (Req 1.2). On migration or connection failure, runMigrations()
  // logs and exits the process with a non-zero status, so control will not
  // return here against a broken schema.
  await runMigrations();

  server = app.listen(PORT, () => {
    console.log(`Ticketer API running on http://localhost:${PORT}`);
    console.log("   GET  /health            - healthcheck");
    console.log("   POST /auth/login        - authenticate");
    console.log("   POST /tickets           - create ticket");
    console.log("   GET  /tickets/:id       - get ticket");
    console.log("   PUT  /tickets/:id/status - change status");
    console.log("   PUT  /tickets/:id/assign - assign ticket");
    console.log("   GET  /queue             - pending tickets");
    console.log("   GET  /notifications     - your notifications");
  });
}

if (process.env.NODE_ENV !== "test") {
  bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

process.on("SIGTERM", () => {
  server?.close(() => {
    process.exit(0);
  });
});

export {
  app,
  server,
  ticketService,
  queueService,
  notificationService,
  userService,
};
