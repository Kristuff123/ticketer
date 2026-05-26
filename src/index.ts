import express from 'express';
import { assertRuntimeConfig, getJsonBodyLimit, getPort } from './config/env.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { cors, loginRateLimiter, requestId, securityHeaders } from './middleware/security.js';
import { UserService, userService } from './services/user-service.js';
import { TicketService } from './services/ticket-service.js';
import { QueueService } from './services/queue-service.js';
import { NotificationService, notificationService } from './services/notification-service.js';
import { createTicketRoutes } from './routes/tickets.js';
import { createQueueRoutes } from './routes/queue.js';
import { createNotificationRoutes } from './routes/notifications.js';
import { createAuthRoutes } from './routes/auth.js';
import { createUserRoutes } from './routes/users.js';

assertRuntimeConfig();

// Create Express app
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(requestId);
app.use(cors);
app.use(securityHeaders);
app.use(express.json({ limit: getJsonBodyLimit() }));

// Wire services together
const ticketService = new TicketService(notificationService, userService);
const queueService = new QueueService();

// Wire ticket lookup so UserService can check ticket ownership for permissions
userService['ticketLookup'] = async (ticketId: string) => {
  const t = ticketService.getTicketStore().get(ticketId);
  if (!t) return null;
  return { reporterId: t.reporterId, assigneeId: t.assigneeId };
};

// Sync queue service with ticket store on every request (in-memory shortcut)
app.use((_req, _res, next) => {
  const ticketStore = ticketService.getTicketStore();
  queueService.setTickets(Array.from(ticketStore.values()));
  next();
});

// Mount auth routes (no auth middleware required for /auth/login)
app.use('/auth/login', loginRateLimiter);
app.use('/auth', createAuthRoutes(userService));

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    storage: 'memory',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Apply authenticate middleware to all routes below
app.use(authenticate);

// Mount protected routes
app.use('/tickets', createTicketRoutes(ticketService));
app.use('/queue', createQueueRoutes(queueService));
app.use('/notifications', createNotificationRoutes(notificationService));
app.use('/users', createUserRoutes(userService));

app.use(notFound);
app.use(errorHandler);

// Start server
const PORT = getPort();
let server: ReturnType<typeof app.listen> | undefined;

if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`Ticketer API running on http://localhost:${PORT}`);
    console.log('   GET  /health            - healthcheck');
    console.log('   POST /auth/login        - authenticate');
    console.log('   POST /tickets           - create ticket');
    console.log('   GET  /tickets/:id       - get ticket');
    console.log('   PUT  /tickets/:id/status - change status');
    console.log('   PUT  /tickets/:id/assign - assign ticket');
    console.log('   GET  /queue             - pending tickets');
    console.log('   GET  /notifications     - your notifications');
  });
}

process.on('SIGTERM', () => {
  server?.close(() => {
    process.exit(0);
  });
});

export { app, server, ticketService, queueService, notificationService, userService };
