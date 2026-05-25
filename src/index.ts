import express from 'express';
import { authenticate } from './middleware/auth.js';
import { UserService, userService } from './services/user-service.js';
import { TicketService } from './services/ticket-service.js';
import { QueueService } from './services/queue-service.js';
import { NotificationService, notificationService } from './services/notification-service.js';
import { createTicketRoutes } from './routes/tickets.js';
import { createQueueRoutes } from './routes/queue.js';
import { createNotificationRoutes } from './routes/notifications.js';
import { createAuthRoutes } from './routes/auth.js';

// Create Express app
const app = express();

// Apply JSON body parser
app.use(express.json());

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
app.use('/auth', createAuthRoutes(userService));

// Apply authenticate middleware to all routes below
app.use(authenticate);

// Mount protected routes
app.use('/tickets', createTicketRoutes(ticketService));
app.use('/queue', createQueueRoutes(queueService));
app.use('/notifications', createNotificationRoutes(notificationService));

// Start server
const PORT = parseInt(process.env.PORT || '3000', 10);

app.listen(PORT, () => {
  console.log(`🎫 Ticketer API running on http://localhost:${PORT}`);
  console.log(`   POST /auth/login        — authenticate`);
  console.log(`   POST /tickets           — create ticket`);
  console.log(`   GET  /tickets/:id       — get ticket`);
  console.log(`   PUT  /tickets/:id/status — change status`);
  console.log(`   PUT  /tickets/:id/assign — assign ticket`);
  console.log(`   GET  /queue             — pending tickets`);
  console.log(`   GET  /notifications     — your notifications`);
});

export { app, ticketService, queueService, notificationService, userService };
