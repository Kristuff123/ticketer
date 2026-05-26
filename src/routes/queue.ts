import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/permissions.js';
import { QueueService } from '../services/queue-service.js';
import { UserRole, Priority, TicketCategory, TicketStatus } from '../models/enums.js';
import { QueueFilters } from '../models/queue.js';

export function createQueueRoutes(queueService: QueueService): Router {
  const router = Router();

  // GET /queue — get pending tickets with filters
  router.get(
    '/',
    requireRole(UserRole.ADMIN),
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const { priority, category, assigneeId, status, sortBy, sortOrder, page, pageSize } = req.query;

      const filters: QueueFilters = {};

      if (priority && Object.values(Priority).includes(priority as Priority)) {
        filters.priority = priority as Priority;
      }
      if (category && Object.values(TicketCategory).includes(category as TicketCategory)) {
        filters.category = category as TicketCategory;
      }
      if (assigneeId) {
        filters.assigneeId = assigneeId as string;
      }
      if (status && Object.values(TicketStatus).includes(status as TicketStatus)) {
        filters.status = status as TicketStatus;
      }
      if (sortBy && ['priority', 'createdAt', 'dueDate'].includes(sortBy as string)) {
        filters.sortBy = sortBy as 'priority' | 'createdAt' | 'dueDate';
      }
      if (sortOrder && ['asc', 'desc'].includes(sortOrder as string)) {
        filters.sortOrder = sortOrder as 'asc' | 'desc';
      }

      const pageNum = page ? parseInt(page as string, 10) : undefined;
      const pageSizeNum = pageSize ? parseInt(pageSize as string, 10) : undefined;

      if (pageNum !== undefined) {
        if (isNaN(pageNum) || pageNum < 1) {
          res.status(400).json({ error: 'VALIDATION_ERROR', message: 'page must be >= 1' });
          return;
        }
        filters.page = pageNum;
      }

      if (pageSizeNum !== undefined) {
        if (isNaN(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > 100) {
          res.status(400).json({ error: 'VALIDATION_ERROR', message: 'pageSize must be between 1 and 100' });
          return;
        }
        filters.pageSize = pageSizeNum;
      }

      const result = await queueService.getPendingTickets(filters);
      res.status(200).json(result);
    }
  );

  // GET /queue/statistics — get queue stats
  router.get(
    '/statistics',
    requireRole(UserRole.ADMIN),
    async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
      const stats = await queueService.getQueueStatistics();
      res.status(200).json(stats);
    }
  );

  // POST /queue/:ticketId/escalate — escalate ticket
  router.post(
    '/:ticketId/escalate',
    requireRole(UserRole.ADMIN),
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      const ticketId = req.params.ticketId as string;

      const result = await queueService.escalateTicket(ticketId);

      if (!result.success) {
        res.status(400).json({ error: 'ESCALATION_ERROR', message: result.error });
        return;
      }

      res.status(200).json(result.ticket);
    }
  );

  return router;
}
